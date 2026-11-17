import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { logAudit } from '../audit';
import { config } from '../config';
import { pool } from '../db';
import { asyncHandler } from '../async-handler';
import { requireAuth, requireRole, validateBody } from '../middleware';

const router = Router();
const loginSchema = z.object({
  username: z.string().trim().min(3).max(60).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});
const createUserSchema = z.object({
  username: z.string().trim().min(3).max(60).regex(/^[a-zA-Z0-9._-]+$/)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  rol: z.enum(['ADMIN', 'OPERADOR']),
});
const dummyHash = bcrypt.hashSync(randomBytes(32).toString('hex'), 12);
const cookieOptions = {
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 30 * 60 * 1000,
};

router.post('/login', validateBody(loginSchema), asyncHandler(async (req, res) => {
  const { username, password } = req.body as z.infer<typeof loginSchema>;
  const connection = await pool.getConnection();
  let user: { id_usuario: number; username: string; password_hash: string; rol: 'ADMIN' | 'OPERADOR'; estado: string; intentos_fallidos: number; bloqueado_hasta: Date | null } | undefined;
  let locked = false;
  let valid = false;

  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<Array<RowDataPacket & {
      id_usuario: number;
      username: string;
      password_hash: string;
      rol: 'ADMIN' | 'OPERADOR';
      estado: string;
      intentos_fallidos: number;
      bloqueado_hasta: Date | null;
    }>>(
      'SELECT id_usuario, username, password_hash, rol, estado, intentos_fallidos, bloqueado_hasta FROM usuarios WHERE username = ? FOR UPDATE',
      [username],
    );
    user = rows[0];
    if (!user) {
      await connection.rollback();
      await bcrypt.compare(password, dummyHash);
      res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
      return;
    }

    locked = Boolean(user.bloqueado_hasta && user.bloqueado_hasta.getTime() > Date.now());
    if (user.estado !== 'ACTIVO' || locked) {
      await connection.commit();
      await bcrypt.compare(password, user.password_hash);
      res.status(locked ? 429 : 401).json({
        error: locked ? 'Cuenta bloqueada temporalmente. Probá más tarde.' : 'Usuario o contraseña incorrectos.',
      });
      return;
    }

    valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const attempts = user.intentos_fallidos + 1;
      const nowLocked = attempts >= 5;
      await connection.execute(
        'UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id_usuario = ?',
        [nowLocked ? 0 : attempts, nowLocked ? new Date(Date.now() + 15 * 60 * 1000) : null, user.id_usuario],
      );
      await connection.execute(
        'INSERT INTO auditoria (id_usuario, accion, entidad, entidad_id, resultado) VALUES (?, ?, ?, ?, ?)',
        [user.id_usuario, 'LOGIN', 'USUARIO', user.id_usuario, 'ERROR'],
      );
      await connection.commit();
      res.status(nowLocked ? 429 : 401).json({
        error: nowLocked ? 'Cuenta bloqueada por 15 minutos tras varios intentos.' : 'Usuario o contraseña incorrectos.',
      });
      return;
    }

    await connection.execute(
      'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_usuario = ?',
      [user.id_usuario],
    );
    await connection.execute(
      'INSERT INTO auditoria (id_usuario, accion, entidad, entidad_id, resultado) VALUES (?, ?, ?, ?, ?)',
      [user.id_usuario, 'LOGIN', 'USUARIO', user.id_usuario, 'OK'],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (!user || !valid) {
    res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    return;
  }
  const token = jwt.sign({ id: user.id_usuario }, config.SESSION_SECRET, { expiresIn: '30m' });
  res.cookie('session', token, cookieOptions).json({
    user: { id: user.id_usuario, username: user.username, rol: user.rol },
  });
}));

router.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  await logAudit(req.user!.id, 'LOGOUT', 'USUARIO', req.user!.id);
  res.clearCookie('session', { ...cookieOptions, maxAge: undefined }).json({ ok: true });
}));

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user!.id, username: req.user!.username, rol: req.user!.role } });
});

router.get('/users', requireAuth, requireRole('ADMIN'), asyncHandler(async (_req, res) => {
  const [rows] = await pool.execute<Array<RowDataPacket & {
    id_usuario: number;
    username: string;
    rol: 'ADMIN' | 'OPERADOR';
    estado: string;
    creado_en: Date;
  }>>('SELECT id_usuario, username, rol, estado, creado_en FROM usuarios ORDER BY username');
  res.json({ users: rows });
}));

router.post(
  '/users',
  requireAuth,
  requireRole('ADMIN'),
  validateBody(createUserSchema),
  asyncHandler(async (req, res) => {
    const { username, password, rol } = req.body as z.infer<typeof createUserSchema>;
    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      'INSERT INTO usuarios (username, password_hash, rol) VALUES (?, ?, ?)',
      [username, hash, rol],
    );
    const id = (result as { insertId: number }).insertId;
    await logAudit(req.user!.id, 'CREATE', 'USUARIO', id);
    res.status(201).json({ id, username, rol, estado: 'ACTIVO' });
  }),
);

router.patch(
  '/users/:id/status',
  requireAuth,
  requireRole('ADMIN'),
  validateBody(z.object({ estado: z.enum(['ACTIVO', 'INACTIVO']) })),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ error: 'Identificador de usuario inválido.' });
      return;
    }
    if (id === req.user!.id) {
      res.status(400).json({ error: 'No podés desactivar tu propia cuenta.' });
      return;
    }
    const { estado } = req.body as { estado: 'ACTIVO' | 'INACTIVO' };
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [activeAdmins] = await connection.execute<Array<RowDataPacket & { id_usuario: number }>>(
        "SELECT id_usuario FROM usuarios WHERE rol = 'ADMIN' AND estado = 'ACTIVO' FOR UPDATE",
      );
      const [rows] = await connection.execute<Array<RowDataPacket & { rol: string; estado: string }>>(
        'SELECT rol, estado FROM usuarios WHERE id_usuario = ? FOR UPDATE',
        [id],
      );
      if (rows.length === 0) {
        await connection.rollback();
        res.status(404).json({ error: 'No se encontró el usuario.' });
        return;
      }
      if (rows[0].rol === 'ADMIN' && estado === 'INACTIVO' && rows[0].estado === 'ACTIVO') {
        if (activeAdmins.length <= 1) {
          await connection.rollback();
          res.status(400).json({ error: 'No se puede desactivar al último administrador activo.' });
          return;
        }
      }
      await connection.execute('UPDATE usuarios SET estado = ? WHERE id_usuario = ?', [estado, id]);
      await connection.execute(
        'INSERT INTO auditoria (id_usuario, accion, entidad, entidad_id, resultado) VALUES (?, ?, ?, ?, ?)',
        [req.user!.id, 'UPDATE_STATUS', 'USUARIO', id, 'OK'],
      );
      await connection.commit();
      res.json({ ok: true, id, estado });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

export default router;

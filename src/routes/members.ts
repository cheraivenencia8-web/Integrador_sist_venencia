import { Router } from 'express';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { pool } from '../db';
import { asyncHandler } from '../async-handler';
import { requireAuth, requireRole, validateBody } from '../middleware';
import { decryptText, encryptPayload, encryptText, hashDni } from '../security/crypto';

const router = Router();
const dniSchema = z.string().trim().regex(/^\d{7,10}$/, 'El DNI debe tener entre 7 y 10 números.')
  .transform((value) => value.replace(/\D/g, ''));
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, 'Fecha inválida.');
const memberSchema = z.object({
  id_categoria: z.number().int().positive(),
  dni: dniSchema,
  nombre_apellido: z.string().trim().min(2).max(140),
  email: z.union([z.string().trim().email().max(254), z.literal('')]).optional()
    .transform((value) => value ? value.toLowerCase() : null),
  fecha_alta: dateSchema,
});
const updateSchema = z.object({
  id_categoria: z.number().int().positive().optional(),
  dni: dniSchema.optional(),
  nombre_apellido: z.string().trim().min(2).max(140).optional(),
  email: z.union([z.string().trim().email().max(254), z.literal('')]).optional()
    .transform((value) => value === '' ? null : value?.toLowerCase()),
  fecha_alta: dateSchema.optional(),
  estado: z.enum(['ACTIVO', 'INACTIVO']).optional(),
}).refine((value) => Object.keys(value).length > 0, 'Indicá al menos un campo para modificar.');

interface MemberRow extends RowDataPacket {
  id_socio: number;
  id_categoria: number;
  categoria: string;
  nombre_apellido: string;
  dni_cifrado: Buffer;
  dni_iv: Buffer;
  dni_tag: Buffer;
  email_cifrado: Buffer | null;
  email_iv: Buffer | null;
  email_tag: Buffer | null;
  fecha_alta: string;
  estado: 'ACTIVO' | 'INACTIVO';
}

function presentMember(row: MemberRow) {
  const hasEmail = row.email_cifrado !== null && row.email_iv !== null && row.email_tag !== null;
  const missingEmail = row.email_cifrado === null && row.email_iv === null && row.email_tag === null;
  if (!hasEmail && !missingEmail) {
    throw new Error('El registro de correo cifrado está incompleto.');
  }
  return {
    id_socio: row.id_socio,
    id_categoria: row.id_categoria,
    categoria: row.categoria,
    dni: decryptText({ ciphertext: row.dni_cifrado, iv: row.dni_iv, tag: row.dni_tag }),
    nombre_apellido: row.nombre_apellido,
    email: hasEmail
      ? decryptText({ ciphertext: row.email_cifrado!, iv: row.email_iv!, tag: row.email_tag! })
      : null,
    fecha_alta: row.fecha_alta,
    estado: row.estado,
  };
}

async function getMembers(search: string, categoryId?: number, state?: string, limit = 100) {
  const where: string[] = [];
  const params: Array<string | number | Buffer> = [];
  if (search) {
    if (/^\d{7,10}$/.test(search)) {
      where.push('s.dni_hash = ?');
      params.push(hashDni(search));
    } else {
      where.push("s.nombre_apellido LIKE ? ESCAPE '\\\\'");
      params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
    }
  }
  if (categoryId !== undefined) {
    where.push('s.id_categoria = ?');
    params.push(categoryId);
  }
  if (state) {
    where.push('s.estado = ?');
    params.push(state);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.execute<MemberRow[]>(
    `SELECT s.id_socio, s.id_categoria, c.nombre AS categoria, s.nombre_apellido,
      s.dni_cifrado, s.dni_iv, s.dni_tag, s.email_cifrado, s.email_iv, s.email_tag,
      s.fecha_alta, s.estado
     FROM socios s JOIN categorias c ON c.id_categoria = s.id_categoria
     ${clause} ORDER BY s.id_socio DESC LIMIT ?`,
    [...params, limit],
  );
  return rows.map(presentMember);
}

async function insertAudit(connection: PoolConnection, userId: number, action: string, memberId: number) {
  await connection.execute(
    'INSERT INTO auditoria (id_usuario, accion, entidad, entidad_id, resultado) VALUES (?, ?, ?, ?, ?)',
    [userId, action, 'SOCIO', memberId, 'OK'],
  );
}

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const rawSearch = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  const rawCategory = req.query.categoria;
  const categoryId = typeof rawCategory === 'string' && /^\d+$/.test(rawCategory) ? Number(rawCategory) : undefined;
  const rawState = req.query.estado;
  const state = rawState === 'ACTIVO' || rawState === 'INACTIVO' ? rawState : undefined;
  if (rawCategory !== undefined && categoryId === undefined) {
    res.status(400).json({ error: 'Filtro de categoría inválido.' });
    return;
  }
  if (rawState !== undefined && state === undefined) {
    res.status(400).json({ error: 'Filtro de estado inválido.' });
    return;
  }
  const members = await getMembers(rawSearch, categoryId, state);
  res.json({ members });
}));

router.post('/', validateBody(memberSchema), asyncHandler(async (req, res) => {
  const input = req.body as z.infer<typeof memberSchema>;
  // Los datos personales se cifran antes de guardarse en MySQL.
  const dniEncrypted = encryptText(input.dni);
  const emailEncrypted = input.email ? encryptText(input.email) : null;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [categories] = await connection.execute<Array<RowDataPacket & { id_categoria: number }>>(
      "SELECT id_categoria FROM categorias WHERE id_categoria = ? AND estado = 'ACTIVA' FOR UPDATE",
      [input.id_categoria],
    );
    if (categories.length === 0) {
      await connection.rollback();
      res.status(400).json({ error: 'Elegí una categoría activa.' });
      return;
    }
    const [result] = await connection.execute(
      `INSERT INTO socios (
        id_categoria, creado_por_usuario, dni_cifrado, dni_iv, dni_tag, dni_hash,
        nombre_apellido, email_cifrado, email_iv, email_tag, fecha_alta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id_categoria, req.user!.id, dniEncrypted.ciphertext, dniEncrypted.iv,
        dniEncrypted.tag, hashDni(input.dni), input.nombre_apellido,
        emailEncrypted?.ciphertext ?? null, emailEncrypted?.iv ?? null,
        emailEncrypted?.tag ?? null, input.fecha_alta,
      ],
    );
    const id = (result as { insertId: number }).insertId;
    // Si guardar la auditoría falla, también se deshace el alta del socio.
    await insertAudit(connection, req.user!.id, 'CREATE', id);
    await connection.commit();
    res.status(201).json({ id_socio: id });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.get('/export', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  if (req.query.encrypted !== 'true') {
    res.status(400).json({ error: 'Indicá encrypted=true para exportar datos cifrados.' });
    return;
  }
  const members = await getMembers('', undefined, undefined, 1000);
  res.json(encryptPayload({ members, exportedAt: new Date().toISOString(), truncated: members.length === 1000 }));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: 'Identificador de socio inválido.' });
    return;
  }
  const [rows] = await pool.execute<MemberRow[]>(
    `SELECT s.id_socio, s.id_categoria, c.nombre AS categoria, s.nombre_apellido,
      s.dni_cifrado, s.dni_iv, s.dni_tag, s.email_cifrado, s.email_iv, s.email_tag,
      s.fecha_alta, s.estado
     FROM socios s JOIN categorias c ON c.id_categoria = s.id_categoria
     WHERE s.id_socio = ?`,
    [id],
  );
  if (rows.length === 0) {
    res.status(404).json({ error: 'No se encontró el socio.' });
    return;
  }
  res.json({ member: presentMember(rows[0]) });
}));

router.patch('/:id', validateBody(updateSchema), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: 'Identificador de socio inválido.' });
    return;
  }
  const changes = req.body as z.infer<typeof updateSchema>;
  if (changes.estado !== undefined && req.user!.role !== 'ADMIN') {
    res.status(403).json({ error: 'Solo ADMIN puede cambiar el estado de un socio.' });
    return;
  }
  const assignments: string[] = [];
  const values: Array<string | number | Buffer | null> = [];
  if (changes.id_categoria !== undefined) {
    assignments.push('id_categoria = ?');
    values.push(changes.id_categoria);
  }
  if (changes.dni !== undefined) {
    const encrypted = encryptText(changes.dni);
    assignments.push('dni_cifrado = ?', 'dni_iv = ?', 'dni_tag = ?', 'dni_hash = ?');
    values.push(encrypted.ciphertext, encrypted.iv, encrypted.tag, hashDni(changes.dni));
  }
  if (changes.nombre_apellido !== undefined) {
    assignments.push('nombre_apellido = ?');
    values.push(changes.nombre_apellido);
  }
  if (changes.email !== undefined) {
    const encrypted = changes.email ? encryptText(changes.email) : null;
    assignments.push('email_cifrado = ?', 'email_iv = ?', 'email_tag = ?');
    values.push(encrypted?.ciphertext ?? null, encrypted?.iv ?? null, encrypted?.tag ?? null);
  }
  if (changes.fecha_alta !== undefined) {
    assignments.push('fecha_alta = ?');
    values.push(changes.fecha_alta);
  }
  if (changes.estado !== undefined) {
    assignments.push('estado = ?');
    values.push(changes.estado);
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (changes.id_categoria !== undefined) {
      const [categories] = await connection.execute<Array<RowDataPacket & { id_categoria: number }>>(
        "SELECT id_categoria FROM categorias WHERE id_categoria = ? AND estado = 'ACTIVA' FOR UPDATE",
        [changes.id_categoria],
      );
      if (categories.length === 0) {
        await connection.rollback();
        res.status(400).json({ error: 'Elegí una categoría activa.' });
        return;
      }
    }
    const [existing] = await connection.execute<Array<RowDataPacket & { id_socio: number }>>(
      'SELECT id_socio FROM socios WHERE id_socio = ? FOR UPDATE',
      [id],
    );
    if (existing.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'No se encontró el socio.' });
      return;
    }
    values.push(id);
    await connection.execute(
      `UPDATE socios SET ${assignments.join(', ')} WHERE id_socio = ?`,
      values,
    );
    await insertAudit(connection, req.user!.id, 'UPDATE', id);
    await connection.commit();
    res.json({ ok: true, id_socio: id });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.delete('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: 'Identificador de socio inválido.' });
    return;
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      "UPDATE socios SET estado = 'INACTIVO' WHERE id_socio = ? AND estado = 'ACTIVO'",
      [id],
    );
    if ((result as { affectedRows: number }).affectedRows === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'No se encontró un socio activo con ese identificador.' });
      return;
    }
    await insertAudit(connection, req.user!.id, 'DEACTIVATE', id);
    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

export default router;

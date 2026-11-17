import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { config } from './config';
import { pool } from './db';

const tokenSchema = z.object({ id: z.number().int().positive() });

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.session;
  if (typeof token !== 'string') {
    res.status(401).json({ error: 'Iniciá sesión para continuar.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.SESSION_SECRET);
    const claims = tokenSchema.safeParse(decoded);
    if (!claims.success) {
      res.status(401).json({ error: 'La sesión no es válida.' });
      return;
    }

    const [rows] = await pool.execute<Array<RowDataPacket & {
      id_usuario: number;
      username: string;
      rol: 'ADMIN' | 'OPERADOR';
    }>>(
      'SELECT id_usuario, username, rol FROM usuarios WHERE id_usuario = ? AND estado = ?',
      [claims.data.id, 'ACTIVO'],
    );
    if (rows.length === 0) {
      res.status(401).json({ error: 'La cuenta está inactiva o la sesión venció.' });
      return;
    }
    req.user = {
      id: rows[0].id_usuario,
      username: rows[0].username,
      role: rows[0].rol,
    };
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'La sesión venció. Iniciá sesión nuevamente.' });
      return;
    }
    next(error);
  }
}

export function requireRole(...roles: Array<'ADMIN' | 'OPERADOR'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'No tenés permiso para realizar esta acción.' });
      return;
    }
    next();
  };
}

export function requireSameOrigin(req: Request, res: Response, next: NextFunction) {
  if (req.get('origin') !== config.APP_ORIGIN) {
    res.status(403).json({ error: 'Origen de solicitud no permitido.' });
    return;
  }
  next();
}

export function validateBody<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Revisá los datos ingresados.', details: parsed.error.issues });
      return;
    }
    req.body = parsed.data;
    next();
  };
}

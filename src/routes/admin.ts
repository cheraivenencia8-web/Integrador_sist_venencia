import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db';
import { asyncHandler } from '../async-handler';
import { requireAuth, requireRole } from '../middleware';

const router = Router();

router.get('/dashboard', requireAuth, asyncHandler(async (_req, res) => {
  const [[members]] = await pool.query<Array<RowDataPacket & { total: number; activos: number }>>(
    "SELECT COUNT(*) AS total, SUM(estado = 'ACTIVO') AS activos FROM socios",
  );
  const [[categories]] = await pool.query<Array<RowDataPacket & { total: number; activas: number }>>(
    "SELECT COUNT(*) AS total, SUM(estado = 'ACTIVA') AS activas FROM categorias",
  );
  res.json({
    socios: { total: Number(members.total), activos: Number(members.activos ?? 0) },
    categorias: { total: Number(categories.total), activas: Number(categories.activas ?? 0) },
  });
}));

router.get('/audit', requireAuth, requireRole('ADMIN'), asyncHandler(async (_req, res) => {
  const [rows] = await pool.execute<Array<RowDataPacket & {
    id_auditoria: number;
    username: string;
    accion: string;
    entidad: string;
    entidad_id: number | null;
    resultado: string;
    fecha: Date;
  }>>(
    `SELECT a.id_auditoria, u.username, a.accion, a.entidad, a.entidad_id, a.resultado, a.fecha
     FROM auditoria a JOIN usuarios u ON u.id_usuario = a.id_usuario
     ORDER BY a.id_auditoria DESC LIMIT 100`,
  );
  res.json({ audit: rows });
}));

export default router;

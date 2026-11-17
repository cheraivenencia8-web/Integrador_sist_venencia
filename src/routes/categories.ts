import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { logAudit } from '../audit';
import { pool } from '../db';
import { asyncHandler } from '../async-handler';
import { requireAuth, requireRole, validateBody } from '../middleware';

const router = Router();
const categorySchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  cuota: z.number().min(0).max(99999999.99),
});

router.use(requireAuth);

router.get('/', asyncHandler(async (_req, res) => {
  const [rows] = await pool.execute<Array<RowDataPacket & {
    id_categoria: number;
    nombre: string;
    cuota: string;
    estado: 'ACTIVA' | 'INACTIVA';
  }>>('SELECT id_categoria, nombre, cuota, estado FROM categorias ORDER BY nombre');
  res.json({ categories: rows });
}));

router.post(
  '/',
  requireRole('ADMIN'),
  validateBody(categorySchema),
  asyncHandler(async (req, res) => {
    const { nombre, cuota } = req.body as z.infer<typeof categorySchema>;
    const [result] = await pool.execute(
      'INSERT INTO categorias (nombre, cuota) VALUES (?, ?)',
      [nombre, cuota],
    );
    const id = (result as { insertId: number }).insertId;
    await logAudit(req.user!.id, 'CREATE', 'CATEGORIA', id);
    res.status(201).json({ id_categoria: id, nombre, cuota, estado: 'ACTIVA' });
  }),
);

router.patch(
  '/:id',
  requireRole('ADMIN'),
  validateBody(categorySchema.partial().refine((value) => Object.keys(value).length > 0)),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ error: 'Identificador de categoría inválido.' });
      return;
    }
    const changes = req.body as Partial<z.infer<typeof categorySchema>>;
    const assignments: string[] = [];
    const values: Array<string | number> = [];
    if (changes.nombre !== undefined) {
      assignments.push('nombre = ?');
      values.push(changes.nombre);
    }
    if (changes.cuota !== undefined) {
      assignments.push('cuota = ?');
      values.push(changes.cuota);
    }
    const [existing] = await pool.execute<Array<RowDataPacket & { id_categoria: number }>>(
      'SELECT id_categoria FROM categorias WHERE id_categoria = ?',
      [id],
    );
    if (existing.length === 0) {
      res.status(404).json({ error: 'No se encontró la categoría.' });
      return;
    }
    values.push(id);
    await pool.execute(
      `UPDATE categorias SET ${assignments.join(', ')} WHERE id_categoria = ?`,
      values,
    );
    await logAudit(req.user!.id, 'UPDATE', 'CATEGORIA', id);
    res.json({ ok: true, id_categoria: id });
  }),
);

router.delete('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: 'Identificador de categoría inválido.' });
    return;
  }
  const [result] = await pool.execute(
    "UPDATE categorias SET estado = 'INACTIVA' WHERE id_categoria = ? AND estado = 'ACTIVA'",
    [id],
  );
  if ((result as { affectedRows: number }).affectedRows === 0) {
    res.status(404).json({ error: 'No se encontró una categoría activa con ese identificador.' });
    return;
  }
  await logAudit(req.user!.id, 'DEACTIVATE', 'CATEGORIA', id);
  res.json({ ok: true });
}));

export default router;

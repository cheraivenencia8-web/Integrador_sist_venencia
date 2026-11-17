import { pool } from './db';

export async function logAudit(
  userId: number,
  action: string,
  entity: string,
  entityId: number | null,
  result: 'OK' | 'ERROR' = 'OK',
) {
  await pool.execute(
    'INSERT INTO auditoria (id_usuario, accion, entidad, entidad_id, resultado) VALUES (?, ?, ?, ?, ?)',
    [userId, action, entity, entityId, result],
  );
}

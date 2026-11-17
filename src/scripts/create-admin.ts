import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db';

async function main() {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!username || !/^[a-zA-Z0-9._-]{3,60}$/.test(username)) {
    throw new Error('Definí BOOTSTRAP_ADMIN_USERNAME (3 a 60 letras, números, punto, guion o guion bajo).');
  }
  if (!password || password.length < 12 || password.length > 128) {
    throw new Error('Definí BOOTSTRAP_ADMIN_PASSWORD con entre 12 y 128 caracteres.');
  }

  const [rows] = await pool.query<Array<RowDataPacket & { total: number }>>('SELECT COUNT(*) AS total FROM usuarios');
  if (rows[0].total > 0) {
    throw new Error('Ya hay usuarios registrados. El alta inicial de ADMIN solo se puede ejecutar una vez.');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.execute(
    'INSERT INTO usuarios (username, password_hash, rol) VALUES (?, ?, ?)',
    [username, passwordHash, 'ADMIN'],
  );
  console.log(`Administrador "${username}" creado.`);
}

main()
  .catch((error: unknown) => {
    console.error('No se pudo crear el administrador:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

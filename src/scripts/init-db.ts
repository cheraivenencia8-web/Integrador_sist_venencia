import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { config } from '../config';

async function main() {
  const connection = await mysql.createConnection({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    charset: 'utf8mb4',
  });
  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await connection.query(`USE \`${config.DB_NAME}\``);
    const schema = await fs.readFile(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
    for (const statement of schema.split(';').map((part) => part.trim()).filter(Boolean)) {
      await connection.query(statement);
    }
    console.log(`Base de datos "${config.DB_NAME}" lista.`);
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  console.error('No se pudo inicializar la base de datos:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

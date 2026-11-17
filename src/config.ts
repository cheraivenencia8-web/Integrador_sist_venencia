import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_ORIGIN: z.string().url().refine((value) => new URL(value).origin === value)
    .default('http://localhost:3000'),
  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().min(1).default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().regex(/^[A-Za-z0-9_]+$/).default('sistema_socios'),
  SESSION_SECRET: z.string().min(32),
  DATA_ENCRYPTION_KEY: z.string().min(1),
  EXPORT_ENCRYPTION_KEY: z.string().min(1),
  DNI_HASH_KEY: z.string().min(1),
});

const parsed = configSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Configuración inválida: ${parsed.error.message}`);
}

function decodeKey(value: string, name: string): Buffer {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) {
    throw new Error(`${name} debe ser una clave Base64 válida de 32 bytes.`);
  }
  return key;
}

export const config = {
  ...parsed.data,
  dataEncryptionKey: decodeKey(parsed.data.DATA_ENCRYPTION_KEY, 'DATA_ENCRYPTION_KEY'),
  exportEncryptionKey: decodeKey(parsed.data.EXPORT_ENCRYPTION_KEY, 'EXPORT_ENCRYPTION_KEY'),
  dniHashKey: decodeKey(parsed.data.DNI_HASH_KEY, 'DNI_HASH_KEY'),
  cookieSecure: parsed.data.NODE_ENV === 'production',
};

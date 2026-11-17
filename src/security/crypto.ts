import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { config } from '../config';

export interface EncryptedValue {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

export interface EncryptedPayload {
  algorithm: 'AES-256-GCM';
  keyVersion: 'v1';
  ciphertext: string;
  iv: string;
  tag: string;
}

export function encryptText(text: string): EncryptedValue {
  // El IV nuevo evita reutilizar los mismos parámetros para distintos datos.
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', config.dataEncryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

export function decryptText(value: EncryptedValue): string {
  const decipher = createDecipheriv('aes-256-gcm', config.dataEncryptionKey, value.iv);
  decipher.setAuthTag(value.tag);
  return Buffer.concat([decipher.update(value.ciphertext), decipher.final()]).toString('utf8');
}

export function hashDni(dni: string): Buffer {
  // Esta huella permite buscar DNI duplicados sin guardarlos en texto claro.
  return createHmac('sha256', config.dniHashKey).update(dni).digest();
}

export function encryptPayload(payload: unknown): EncryptedPayload {
  // Las exportaciones usan una clave distinta de la que cifra DNI y email.
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', config.exportEncryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return {
    algorithm: 'AES-256-GCM',
    keyVersion: 'v1',
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptExportPayload(payload: unknown): unknown {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('algorithm' in payload) ||
    !('keyVersion' in payload) ||
    !('ciphertext' in payload) ||
    !('iv' in payload) ||
    !('tag' in payload) ||
    payload.algorithm !== 'AES-256-GCM' ||
    payload.keyVersion !== 'v1' ||
    typeof payload.ciphertext !== 'string' ||
    typeof payload.iv !== 'string' ||
    typeof payload.tag !== 'string'
  ) {
    throw new Error('El archivo no tiene un formato de exportación compatible.');
  }

  const ciphertext = Buffer.from(payload.ciphertext, 'base64');
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  if (
    ciphertext.toString('base64') !== payload.ciphertext ||
    iv.toString('base64') !== payload.iv ||
    tag.toString('base64') !== payload.tag ||
    iv.length !== 12 ||
    tag.length !== 16
  ) {
    throw new Error('El archivo de exportación está mal formado.');
  }

  const decipher = createDecipheriv('aes-256-gcm', config.exportEncryptionKey, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  return JSON.parse(plaintext) as unknown;
}

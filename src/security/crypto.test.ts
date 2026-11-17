import assert from 'node:assert/strict';
import { before, test } from 'node:test';

let crypto: typeof import('./crypto');

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-session-secret-not-for-real-use';
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
  process.env.EXPORT_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString('base64');
  process.env.DNI_HASH_KEY = Buffer.alloc(32, 3).toString('base64');
  crypto = await import('./crypto');
});

test('cifra y descifra texto con AES-GCM', () => {
  const encrypted = crypto.encryptText('dato de prueba');
  assert.equal(crypto.decryptText(encrypted), 'dato de prueba');
  assert.equal(encrypted.iv.length, 12);
  assert.equal(encrypted.tag.length, 16);
});

test('rechaza texto cifrado alterado', () => {
  const encrypted = crypto.encryptText('dato protegido');
  encrypted.ciphertext[0] ^= 1;
  assert.throws(() => crypto.decryptText(encrypted));
});

test('la huella HMAC es repetible para el mismo DNI', () => {
  assert.deepEqual(crypto.hashDni('12345678'), crypto.hashDni('12345678'));
  assert.notDeepEqual(crypto.hashDni('12345678'), crypto.hashDni('87654321'));
});

test('la exportación entrega ciphertext, IV, tag y versión de clave', () => {
  const result = crypto.encryptPayload({ members: [] });
  assert.equal(result.algorithm, 'AES-256-GCM');
  assert.equal(result.keyVersion, 'v1');
  assert.ok(Buffer.from(result.ciphertext, 'base64').length > 0);
  assert.equal(Buffer.from(result.iv, 'base64').length, 12);
  assert.equal(Buffer.from(result.tag, 'base64').length, 16);
  assert.deepEqual(crypto.decryptExportPayload(result), { members: [] });
});

import fs from 'node:fs/promises';
import path from 'node:path';
import { decryptExportPayload } from '../security/crypto';

async function main() {
  const [, , inputArg, outputArg] = process.argv;
  if (!inputArg || !outputArg) {
    throw new Error('Uso: npm run export:decrypt -- <archivo-cifrado.json> <archivo-descifrado.json>');
  }
  const inputPath = path.resolve(inputArg);
  const outputPath = path.resolve(outputArg);
  if (inputPath === outputPath) {
    throw new Error('El archivo de salida debe ser distinto al archivo cifrado.');
  }
  const encrypted = JSON.parse(await fs.readFile(inputPath, 'utf8')) as unknown;
  const decrypted = decryptExportPayload(encrypted);
  await fs.writeFile(outputPath, `${JSON.stringify(decrypted, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  console.log(`Exportación descifrada guardada en: ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error('No se pudo descifrar la exportación:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

import { app } from './app';
import { config } from './config';
import { pool } from './db';

const server = app.listen(config.PORT, () => {
  console.log(`Sistema de socios escuchando en ${config.APP_ORIGIN}`);
});

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

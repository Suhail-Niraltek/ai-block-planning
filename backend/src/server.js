import { createApp } from './app.js';
import { env } from './config/env.js';
import { checkDatabase, closePool } from './database/connection.js';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`[server] AI Block Planning API listening on http://localhost:${env.port}`);
  console.log(`[server] health: http://localhost:${env.port}/api/v1/health`);
});

const health = await checkDatabase();

if (health.connected) {
  console.log(`[server] MySQL connected: ${env.mysql.database}`);
} else {
  console.warn(`[server] MySQL unavailable: ${health.error}`);
  console.warn('[server] The API still starts so /health can report the failure.');
}

async function shutdown(signal) {
  console.log(`\n[server] ${signal} received, shutting down`);
  server.close();
  await closePool();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

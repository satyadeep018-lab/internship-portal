'use strict';

const path = require('node:path');
const { openDb } = require('./db');
const { createApp } = require('./app');
const logger = require('./logger');

const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'internships.db');
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

const db = openDb(DB_PATH);
const count = db.prepare('SELECT COUNT(*) AS n FROM internships').get().n;
if (count === 0) logger.warn('database_empty', { hint: 'Run "npm run seed" to load the sample records.' });
if (ADMIN_API_KEY && ADMIN_API_KEY.length < 16) logger.warn('admin_key_short', { hint: 'Use 16 or more random characters.' });

const app = createApp(db, {
  adminKey: ADMIN_API_KEY,
  trustProxy: Number(process.env.TRUST_PROXY) || 0,
  rateLimits: {
    api: Number(process.env.RATE_LIMIT_MAX) || 100,
    apply: Number(process.env.APPLY_RATE_LIMIT_MAX) || 10
  }
});

const server = app.listen(PORT, () => {
  logger.info('server_started', { port: PORT, node: process.version, internships: count, adminWritesEnabled: Boolean(ADMIN_API_KEY) });
  console.log(`Internship portal running at http://localhost:${PORT}`);
});

server.on('error', (e) => {
  logger.error('server_error', { code: e.code || e.name });
  console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Set a different PORT.` : 'The server could not start.');
  process.exit(1);
});

// Hosts send SIGTERM on deploys and restarts: stop accepting requests, finish the current ones, close the database.
function shutdown(signal) {
  logger.info('shutting_down', { signal });
  const force = setTimeout(() => process.exit(1), 10000);
  force.unref();
  server.close(() => {
    try { db.close(); } catch (e) { /* already closed */ }
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

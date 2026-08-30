import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Splits a migration file into individual statements. The migrations contain
 * plain DDL only (no routines), so a semicolon at a statement boundary is a
 * safe separator once comment lines are stripped.
 */
function splitStatements(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function connectWithoutDatabase() {
  return mysql.createConnection({
    host: env.mysql.host,
    port: env.mysql.port,
    user: env.mysql.user,
    password: env.mysql.password,
    multipleStatements: false,
  });
}

async function ensureDatabase() {
  const connection = await connectWithoutDatabase();

  try {
    // Identifiers cannot be parameterised, so the name is whitelisted instead.
    if (!/^[A-Za-z0-9_]+$/.test(env.mysql.database)) {
      throw new Error(`Unsafe database name: ${env.mysql.database}`);
    }

    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${env.mysql.database}\` ` +
        'DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci',
    );

    console.log(`[migrate] database ready: ${env.mysql.database}`);
  } finally {
    await connection.end();
  }
}

async function ensureMigrationsTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id CHAR(36) NOT NULL,
      filename VARCHAR(160) NOT NULL,
      applied_at DATETIME(3) NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_schema_migrations_filename (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);
}

export async function runMigrations() {
  await ensureDatabase();

  const connection = await mysql.createConnection({
    host: env.mysql.host,
    port: env.mysql.port,
    user: env.mysql.user,
    password: env.mysql.password,
    database: env.mysql.database,
    multipleStatements: false,
  });

  try {
    await ensureMigrationsTable(connection);

    const [applied] = await connection.query('SELECT filename FROM schema_migrations');
    const alreadyApplied = new Set(applied.map((row) => row.filename));

    const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();

    let appliedCount = 0;

    for (const filename of files) {
      if (alreadyApplied.has(filename)) {
        console.log(`[migrate] skip ${filename} (already applied)`);
        continue;
      }

      const sql = await readFile(join(migrationsDir, filename), 'utf8');

      for (const statement of splitStatements(sql)) {
        await connection.query(statement);
      }

      await connection.execute(
        'INSERT INTO schema_migrations (id, filename, applied_at) VALUES (?, ?, UTC_TIMESTAMP(3))',
        [randomUUID(), filename],
      );

      appliedCount += 1;
      console.log(`[migrate] applied ${filename}`);
    }

    console.log(`[migrate] done, ${appliedCount} new migration(s) applied`);
  } finally {
    await connection.end();
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;

if (invokedDirectly || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[migrate] failed:', error.message);
      process.exit(1);
    });
}

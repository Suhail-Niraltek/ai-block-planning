import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

/**
 * Shared pool. `dateStrings` keeps DATETIME(3) values as UTC strings so the
 * driver never re-interprets them in the host machine's local timezone.
 */
export const pool = mysql.createPool({
  host: env.mysql.host,
  port: env.mysql.port,
  user: env.mysql.user,
  password: env.mysql.password,
  database: env.mysql.database,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z',
  dateStrings: true,
  charset: 'utf8mb4_general_ci',
  multipleStatements: false,
});

export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

export async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

/** Runs `work` inside a transaction and rolls back on any thrown error. */
export async function withTransaction(work) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function checkDatabase() {
  try {
    await pool.query('SELECT 1');
    return { connected: true, error: null };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

export async function closePool() {
  await pool.end();
}

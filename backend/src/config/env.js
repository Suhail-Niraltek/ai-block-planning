import 'dotenv/config';

/**
 * Reads a required environment value.
 * Missing required values fail fast at startup rather than at first query.
 */
function required(name, fallback) {
  const value = process.env[name] ?? fallback;

  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function integer(name, fallback) {
  const raw = process.env[name];

  if (raw === undefined || raw === '') {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isInteger(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, received "${raw}"`);
  }

  return parsed;
}

export const env = {
  port: integer('PORT', 3000),
  frontendOrigin: required('FRONTEND_ORIGIN', 'http://localhost:4200'),

  mysql: {
    host: required('MYSQL_HOST', '127.0.0.1'),
    port: integer('MYSQL_PORT', 3306),
    database: required('MYSQL_DATABASE', 'ai_block_planning'),
    user: required('MYSQL_USER', 'root'),
    // An empty password is legitimate for a local MySQL install, so it is not `required`.
    password: process.env.MYSQL_PASSWORD ?? 'root',
  },

  planning: {
    demoSeed: integer('DEMO_SEED', 26027),
    slotMinutes: integer('PLANNING_SLOT_MINUTES', 15),
    trainBufferMinutes: integer('TRAIN_BUFFER_MINUTES', 10),
    solverTimeLimitSeconds: integer('SOLVER_TIME_LIMIT_SECONDS', 30),
  },
};

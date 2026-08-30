import { ZodError } from 'zod';
import { ApiError, fail } from './api-response.js';

/** Maps MySQL driver errors onto stable API error codes. */
function fromDatabaseError(error) {
  switch (error.code) {
    case 'ER_DUP_ENTRY':
      return { code: 'CONFLICT', message: 'Record already exists', status: 409 };
    case 'ER_NO_REFERENCED_ROW_2':
    case 'ER_ROW_IS_REFERENCED_2':
      return { code: 'CONFLICT', message: 'Related record constraint failed', status: 409 };
    case 'ER_NO_SUCH_TABLE':
      return {
        code: 'DATABASE_NOT_MIGRATED',
        message: 'Database tables are missing. Run "npm run migrate".',
        status: 503,
      };
    case 'ECONNREFUSED':
    case 'ER_ACCESS_DENIED_ERROR':
    case 'ER_BAD_DB_ERROR':
      return {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Cannot reach MySQL. Check backend/.env credentials.',
        status: 503,
      };
    default:
      return null;
  }
}

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity.
export function errorHandler(error, req, res, next) {
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));

    return fail(res, 'VALIDATION_ERROR', 'Request validation failed', details, 400);
  }

  if (error instanceof ApiError) {
    return fail(res, error.code, error.message, error.details, error.status);
  }

  const databaseError = fromDatabaseError(error);

  if (databaseError) {
    return fail(res, databaseError.code, databaseError.message, [], databaseError.status);
  }

  console.error('[unhandled]', error);

  return fail(res, 'INTERNAL_ERROR', 'Unexpected server error', [], 500);
}

import { fail } from './api-response.js';

export function notFound(req, res) {
  return fail(res, 'NOT_FOUND', `No route matches ${req.method} ${req.originalUrl}`, [], 404);
}

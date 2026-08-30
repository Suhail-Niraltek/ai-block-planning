/** The single success envelope used by every endpoint. */
export function ok(res, data, message = null, status = 200) {
  return res.status(status).json({ success: true, data, message });
}

/** The single error envelope used by every endpoint. */
export function fail(res, code, message, details = [], status = 400) {
  return res.status(status).json({
    success: false,
    error: { code, message, details },
  });
}

/**
 * Domain error carrying an API error code and HTTP status, so services can
 * signal failures without importing Express.
 */
export class ApiError extends Error {
  constructor(code, message, status = 400, details = []) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  static notFound(message, details = []) {
    return new ApiError('NOT_FOUND', message, 404, details);
  }

  static validation(message, details = []) {
    return new ApiError('VALIDATION_ERROR', message, 400, details);
  }

  static conflict(message, details = []) {
    return new ApiError('CONFLICT', message, 409, details);
  }
}

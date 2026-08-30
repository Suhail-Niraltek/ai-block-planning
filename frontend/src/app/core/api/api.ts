import { Service } from '@angular/core';

/** The error envelope every failing endpoint returns. */
interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  readonly details?: readonly unknown[];
}

interface ApiEnvelope<T> {
  readonly success: boolean;
  readonly data: T;
  readonly message: string | null;
  readonly error?: ApiErrorBody;
}

/** Thrown for any non-success response, carrying the server's error code. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: readonly unknown[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

@Service()
export class Api {
  private readonly baseUrl = '/api/v1';

  get<T>(path: string, query?: Record<string, string | number | boolean | null | undefined>): Promise<T> {
    return this.request<T>(this.withQuery(path, query), { method: 'GET' });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  }

  private withQuery(
    path: string,
    query?: Record<string, string | number | boolean | null | undefined>,
  ): string {
    if (!query) {
      return path;
    }

    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined && value !== '') {
        params.set(key, String(value));
      }
    }

    const queryString = params.toString();

    return queryString ? `${path}?${queryString}` : path;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;

    try {
      response = await fetch(this.baseUrl + path, init);
    } catch {
      // A network-level failure has no envelope to read, so it is named here.
      throw new ApiError(
        'NETWORK_ERROR',
        'Cannot reach the planning API. Is the backend running on port 3000?',
      );
    }

    let payload: ApiEnvelope<T> | null = null;

    try {
      payload = (await response.json()) as ApiEnvelope<T>;
    } catch {
      throw new ApiError('BAD_RESPONSE', `The API returned a non-JSON response (${response.status})`);
    }

    if (!response.ok || !payload.success) {
      throw new ApiError(
        payload.error?.code ?? 'REQUEST_FAILED',
        payload.error?.message ?? `Request failed with status ${response.status}`,
        payload.error?.details ?? [],
      );
    }

    return payload.data;
  }
}

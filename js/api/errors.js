export const RETRYABLE = { NETWORK: true, BUSY: true };

export class ApiError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'ApiError';
    this.code = code || 'NETWORK';
    this.retryable = !!RETRYABLE[this.code];
  }
}

// Turns a server JSON response into a value or a thrown ApiError.
export function unwrap(res) {
  if (!res || typeof res !== 'object') throw new ApiError('NETWORK', 'Bad response');
  if (res.ok) return res;
  throw new ApiError(res.code || 'BAD_INPUT', res.error || 'Request failed');
}

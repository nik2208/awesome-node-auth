export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 401,
    public readonly data?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

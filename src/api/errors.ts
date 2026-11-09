export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

export class AuthRequiredError extends ApiError {
  constructor(message: string) {
    super(401, 'authentication_required', message);
    this.name = 'AuthRequiredError';
  }
}

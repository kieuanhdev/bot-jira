export class JiraRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
    readonly errorDetails?: string | null,
    readonly retryAfterMs: number | null = null
  ) {
    super(message);
    this.name = "JiraRequestError";
  }
}

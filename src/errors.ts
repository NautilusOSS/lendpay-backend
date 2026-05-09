export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = "HTTP_ERROR"
  ) {
    super(message);
    this.name = "HttpError";
  }
}

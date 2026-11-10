export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const unauthorized = (message = "Sign in first.") => new AppError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You cannot do this.") => new AppError(403, "FORBIDDEN", message);
export const suspended = () => new AppError(403, "ACCOUNT_SUSPENDED", "This account is suspended.");
export const notFound = (what: string) => new AppError(404, "NOT_FOUND", `${what} not found.`);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const unprocessable = (code: string, message: string) => new AppError(422, code, message);
export const aiUnavailable = (message: string) => new AppError(503, "AI_UNAVAILABLE", message);

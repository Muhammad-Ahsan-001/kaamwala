/** Error codes the API can return that screens respond to specifically. */
export type ApiErrorCode =
  | "WORKER_NOT_AVAILABLE"
  | "WORKER_ENGAGED"
  | "BELOW_FLOOR"
  | "CNIC_DUPLICATE"
  | "AI_UNAVAILABLE"
  | "TRADE_NOT_RECOGNISED"
  | "INVALID_OTP"
  | "NOT_FOUND"
  | "UNKNOWN";

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorCode(error: unknown): ApiErrorCode {
  return error instanceof ApiError ? error.code : "UNKNOWN";
}

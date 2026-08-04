export type GitHubErrorCode = "INVALID_URL" | "NOT_FOUND" | "PRIVATE" | "RATE_LIMITED" | "UNKNOWN";

export class GitHubError extends Error {
  code: GitHubErrorCode;
  /** Unix epoch seconds when the rate limit resets, only set when code === "RATE_LIMITED". */
  resetAt?: number;

  constructor(code: GitHubErrorCode, message: string, resetAt?: number) {
    super(message);
    this.name = "GitHubError";
    this.code = code;
    this.resetAt = resetAt;
  }
}

export class EvaluationError extends Error {
  classId: string;

  constructor(classId: string, message: string) {
    super(message);
    this.name = "EvaluationError";
    this.classId = classId;
  }
}

/** Postgres unique_violation (23505) — the driver nests the real pg error under Error.cause, not .message. */
export function isUniqueViolation(error: unknown): boolean {
  const cause = error instanceof Error ? (error.cause as { code?: string } | undefined) : undefined;
  return cause?.code === "23505";
}

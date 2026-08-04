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

/**
 * Per-class cache-dedup versions, replacing a single global PROMPT_VERSION. Bumping one class's
 * entry here forces only that class's next submission to regrade (see findExistingAttempt) —
 * every other class's cached attempts stay untouched. Bump a class's entry whenever that class's
 * grader logic (prompt, evidence extraction, rubric) changes materially.
 */
const CLASS_PROMPT_VERSIONS: Record<string, string> = {
  "class-01": "v4",
  "class-02": "v4",
  "class-03": "v4",
  "class-02a": "v2",
  "class-02b": "v2",
};

/** Any class not yet listed above (e.g. a brand-new class) gets its own isolated version, never colliding with an existing class's cached attempts. */
const DEFAULT_PROMPT_VERSION = "v1";

export function getPromptVersionForClass(classSlug: string): string {
  return CLASS_PROMPT_VERSIONS[classSlug] ?? DEFAULT_PROMPT_VERSION;
}

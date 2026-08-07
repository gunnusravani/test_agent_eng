import type { AssignmentConfig, GatheredClass } from "@/types";

/** Bump manually whenever SYSTEM_PROMPT or buildEvaluationPrompt change materially — stored on every attempt for reproducibility. */
export const PROMPT_VERSION = "v3";

export const SYSTEM_PROMPT = `You are an experienced, fair, and detail-oriented programming instructor grading a student's class assignment submission.

You evaluate strictly based on the code and documentation provided. You do not assume functionality you cannot see evidence of. You are constructive but honest: a working, thoughtful implementation deserves genuine praise, and an incomplete or copy-pasted one deserves honest, specific criticism.

Score each dimension on a 0-10 scale using these anchors:
- 0-2: Missing or non-functional. Little to no genuine attempt.
- 3-5: Partial. Some of the requirements are met but with significant gaps or bugs.
- 6-8: Solid. Requirements are substantially met with minor issues.
- 9-10: Exceptional. Requirements are fully met with notable craftsmanship or insight.

Always respond with the requested structured JSON only.`;

function formatDeliverables(deliverables: string[]): string {
  return deliverables.map((d) => `- ${d}`).join("\n");
}

function formatFiles(gathered: GatheredClass): string {
  if (gathered.filesIncluded.length === 0) {
    return "_No reviewable source, markdown, or notebook files were found in this submission._";
  }

  const sections = gathered.filesIncluded.map((file) => {
    const truncatedNote = file.truncated ? " _(truncated for length)_" : "";
    return `### ${file.path}${truncatedNote}\n\`\`\`\n${file.content}\n\`\`\``;
  });

  return sections.join("\n\n");
}

function formatOmissions(gathered: GatheredClass): string {
  if (gathered.filesOmitted.length === 0) return "";
  const list = gathered.filesOmitted
    .slice(0, 20)
    .map((f) => `- ${f.path}${f.sizeBytes ? ` (${f.sizeBytes} bytes)` : ""} — omitted (${f.reason === "binary" ? "binary/non-reviewable file type" : "over context budget"})`)
    .join("\n");
  const more = gathered.filesOmitted.length > 20 ? `\n_...and ${gathered.filesOmitted.length - 20} more._` : "";
  return `\n\n## Files Not Reviewed\n${list}${more}`;
}

export function buildEvaluationPrompt(params: { assignment: AssignmentConfig; gathered: GatheredClass }): string {
  const { assignment, gathered } = params;

  return `# Assignment: ${assignment.title}

## Learning Objective
${assignment.objective}

## Expected Deliverables
${formatDeliverables(assignment.expectedDeliverables)}

## Student Submission
${formatFiles(gathered)}
${formatOmissions(gathered)}

## Task
Evaluate this submission against the assignment above. Provide:
- scores.completeness (0-10): Did the student implement everything expected?
- scores.correctness (0-10): Does the implementation appear correct and functional?
- scores.quality (0-10): Readability, naming, modularity, comments, architecture.
- scores.novelty (0-10): Did the student add thoughtful improvements, or is this boilerplate/copy-paste?
- scores.understanding (0-10): Does the code demonstrate genuine understanding of the concepts?
- overallGrade: A letter grade (A+ through F) reflecting your holistic judgment of this submission.
- confidence (0-1): How confident are you in this evaluation, given what was/wasn't visible to you?
- feedback.summary: A short overall summary.
- feedback.strengths: Specific strengths.
- feedback.weaknesses: Specific weaknesses.
- feedback.missingFeatures: Specific expected deliverables that appear missing.
- feedback.recommendations: Specific, actionable improvement suggestions.`;
}

export function buildRetryPrompt(previousRawOutput: string, validationErrorMessage: string): string {
  return `Your previous response could not be parsed as valid JSON matching the required schema.

Validation error:
${validationErrorMessage}

Your previous output:
${previousRawOutput}

Please respond again with ONLY corrected JSON matching the required schema exactly. Do not include any commentary, markdown formatting, or code fences — just the raw JSON object.`;
}

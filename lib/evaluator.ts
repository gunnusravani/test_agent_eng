import { generateObject, NoObjectGeneratedError } from "ai";
import { openai } from "@ai-sdk/openai";
import type { z } from "zod";
import { assignmentEvaluationSchema, type AssignmentEvaluationResult } from "@/types/schemas";
import type { AssignmentConfig, GatheredClass } from "@/types";
import { buildEvaluationPrompt, buildRetryPrompt, SYSTEM_PROMPT } from "./prompts";

export const MODEL_NAME = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const MAX_ATTEMPTS = 3;

/**
 * generateObject with a retry-on-malformed-JSON loop — shared by evaluateAssignment
 * below and lib/graders/class-02.ts, which grades against a different schema/prompt
 * but needs the exact same "ask the model to fix its own broken JSON" behavior.
 */
export async function generateObjectWithRetry<T>(params: {
  schema: z.ZodType<T>;
  system: string;
  initialPrompt: string;
  buildRetryPrompt: (previousRawOutput: string, validationErrorMessage: string) => string;
  maxAttempts?: number;
}): Promise<{ status: "success"; data: T } | { status: "error"; message: string }> {
  const { schema, system, initialPrompt, buildRetryPrompt: buildRetry, maxAttempts = MAX_ATTEMPTS } = params;

  let prompt = initialPrompt;
  let lastError: string = "Unknown error";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { object } = await generateObject({
        model: openai(MODEL_NAME),
        schema,
        system,
        prompt,
      });
      return { status: "success", data: object };
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        lastError = error.cause instanceof Error ? error.cause.message : error.message;
        prompt = buildRetry(error.text ?? "", lastError);
        continue;
      }
      lastError = error instanceof Error ? error.message : "Unknown evaluation error";
      break;
    }
  }

  return { status: "error", message: `Failed to evaluate after ${maxAttempts} attempts: ${lastError}` };
}

export async function evaluateAssignment(params: {
  assignment: AssignmentConfig;
  gathered: GatheredClass;
}): Promise<AssignmentEvaluationResult> {
  const { assignment, gathered } = params;
  const classId = gathered.classId;

  const result = await generateObjectWithRetry({
    schema: assignmentEvaluationSchema,
    system: SYSTEM_PROMPT,
    initialPrompt: buildEvaluationPrompt({ assignment, gathered }),
    buildRetryPrompt,
  });

  if (result.status === "error") {
    return { status: "error", classId, message: result.message };
  }
  return { status: "success", classId, data: result.data, evaluatedAt: new Date().toISOString(), modelUsed: MODEL_NAME };
}

import { generateObject, NoObjectGeneratedError } from "ai";
import { openai } from "@ai-sdk/openai";
import { assignmentEvaluationSchema, type AssignmentEvaluationResult } from "@/types/schemas";
import type { AssignmentConfig, GatheredClass } from "@/types";
import { buildEvaluationPrompt, buildRetryPrompt, SYSTEM_PROMPT } from "./prompts";

export const MODEL_NAME = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const MAX_ATTEMPTS = 3;

export async function evaluateAssignment(params: {
  assignment: AssignmentConfig;
  gathered: GatheredClass;
}): Promise<AssignmentEvaluationResult> {
  const { assignment, gathered } = params;
  const classId = gathered.classId;

  let prompt = buildEvaluationPrompt({ assignment, gathered });
  let lastError: string = "Unknown error";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { object } = await generateObject({
        model: openai(MODEL_NAME),
        schema: assignmentEvaluationSchema,
        system: SYSTEM_PROMPT,
        prompt,
      });

      return {
        status: "success",
        classId,
        data: object,
        evaluatedAt: new Date().toISOString(),
        modelUsed: MODEL_NAME,
      };
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        lastError = error.cause instanceof Error ? error.cause.message : error.message;
        prompt = buildRetryPrompt(error.text ?? "", lastError);
        continue;
      }
      lastError = error instanceof Error ? error.message : "Unknown evaluation error";
      break;
    }
  }

  return { status: "error", classId, message: `Failed to evaluate after ${MAX_ATTEMPTS} attempts: ${lastError}` };
}

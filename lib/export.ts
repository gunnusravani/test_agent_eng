import { scoreToGrade } from "@/lib/grades";
import type { AssignmentEvaluationResult } from "@/types/schemas";

export interface ExportContext {
  owner: string;
  repo: string;
  classSlug: string;
  classTitle: string;
  evaluation: AssignmentEvaluationResult;
  weightedScore: number | null;
}

export function buildJsonReport(ctx: ExportContext): string {
  return JSON.stringify(ctx, null, 2);
}

function formatScoreLine(label: string, value: number): string {
  return `- ${label}: ${value.toFixed(1)} / 10`;
}

export function buildMarkdownReport(ctx: ExportContext): string {
  const { owner, repo, classSlug, classTitle, evaluation, weightedScore } = ctx;

  const lines: string[] = [];
  lines.push(`# ${classTitle} — Evaluation`);
  lines.push("");
  lines.push(`Repository: [${owner}/${repo}](https://github.com/${owner}/${repo})`);
  lines.push(`Class: ${classSlug}`);
  lines.push("");

  if (evaluation.status === "error") {
    lines.push(`_Evaluation failed: ${evaluation.message}_`);
    return lines.join("\n");
  }

  const { data } = evaluation;
  const grade = weightedScore != null ? scoreToGrade(weightedScore) : null;
  lines.push(`Grade: **${grade ?? "N/A"}**${weightedScore != null ? ` (${weightedScore.toFixed(1)} / 10)` : ""}`);
  lines.push(`Confidence: ${Math.round(data.confidence * 100)}%`);
  lines.push("");
  lines.push(formatScoreLine("Completeness", data.scores.completeness));
  lines.push(formatScoreLine("Correctness", data.scores.correctness));
  lines.push(formatScoreLine("Quality", data.scores.quality));
  lines.push(formatScoreLine("Novelty", data.scores.novelty));
  lines.push(formatScoreLine("Understanding", data.scores.understanding));
  lines.push("");
  lines.push(`**Summary:** ${data.feedback.summary}`);
  lines.push("");

  if (data.feedback.strengths.length > 0) {
    lines.push("**Strengths:**");
    for (const s of data.feedback.strengths) lines.push(`- ${s}`);
    lines.push("");
  }
  if (data.feedback.weaknesses.length > 0) {
    lines.push("**Weaknesses:**");
    for (const w of data.feedback.weaknesses) lines.push(`- ${w}`);
    lines.push("");
  }
  if (data.feedback.missingFeatures.length > 0) {
    lines.push("**Missing Features:**");
    for (const m of data.feedback.missingFeatures) lines.push(`- ${m}`);
    lines.push("");
  }
  if (data.feedback.recommendations.length > 0) {
    lines.push("**Recommendations:**");
    for (const r of data.feedback.recommendations) lines.push(`- ${r}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

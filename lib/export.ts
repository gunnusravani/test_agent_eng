import { getAssignment } from "@/config/assignments";
import type { RepositoryReport } from "@/types/schemas";

export function buildJsonReport(report: RepositoryReport): string {
  return JSON.stringify(report, null, 2);
}

function formatScoreLine(label: string, value: number): string {
  return `- ${label}: ${value.toFixed(1)} / 10`;
}

export function buildMarkdownReport(report: RepositoryReport): string {
  const { repository, aggregate, classEvaluations, generatedAt } = report;

  const lines: string[] = [];
  lines.push(`# Repository Evaluation`);
  lines.push("");
  lines.push(`Repository: [${repository.owner}/${repository.repo}](${repository.url})`);
  lines.push(`Generated: ${new Date(generatedAt).toLocaleString()}`);
  lines.push("");
  lines.push(`## Overall Score`);
  lines.push("");
  lines.push(`- Grade: **${aggregate.overallGrade}**`);
  lines.push(`- Completion: ${aggregate.completedCount} / ${aggregate.totalCount} assignments completed (${Math.round(aggregate.completionPercentage)}%)`);
  lines.push(`- Average confidence: ${Math.round(aggregate.averageConfidence * 100)}%`);
  lines.push(formatScoreLine("Completeness", aggregate.averageScores.completeness));
  lines.push(formatScoreLine("Correctness", aggregate.averageScores.correctness));
  lines.push(formatScoreLine("Quality", aggregate.averageScores.quality));
  lines.push(formatScoreLine("Novelty", aggregate.averageScores.novelty));
  lines.push(formatScoreLine("Understanding", aggregate.averageScores.understanding));
  lines.push("");
  lines.push("---");

  for (const evaluation of classEvaluations) {
    const title = getAssignment(evaluation.classId)?.title ?? evaluation.classId;
    lines.push("");
    lines.push(`## ${evaluation.classId}: ${title}`);
    lines.push("");

    if (evaluation.status === "not_submitted") {
      lines.push("_Not submitted._");
      continue;
    }

    if (evaluation.status === "error") {
      lines.push(`_Evaluation failed: ${evaluation.message}_`);
      continue;
    }

    const { data } = evaluation;
    lines.push(`Grade: **${data.overallGrade}** (confidence: ${Math.round(data.confidence * 100)}%)`);
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
    lines.push("---");
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

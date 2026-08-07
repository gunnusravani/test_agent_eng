"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AdminAssignmentVersionDto, AdminClassDto, RubricWeights } from "@/types/schemas";

const fieldClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30";

const EVEN_WEIGHTS: RubricWeights = { completeness: 20, correctness: 20, quality: 20, novelty: 20, understanding: 20 };

interface VersionFormState {
  title: string;
  objective: string;
  expectedDeliverablesText: string;
  expectedForkOf: string;
  rubricWeights: RubricWeights;
}

function versionToForm(version: AdminAssignmentVersionDto | undefined, classRow: AdminClassDto): VersionFormState {
  if (!version) {
    return {
      title: "",
      objective: "",
      expectedDeliverablesText: "",
      expectedForkOf: classRow.expectedForkOf ?? "",
      rubricWeights: EVEN_WEIGHTS,
    };
  }
  return {
    title: version.title,
    objective: version.objective,
    expectedDeliverablesText: version.expectedDeliverables.join("\n"),
    expectedForkOf: version.expectedForkOf ?? "",
    rubricWeights: { ...version.rubricWeights },
  };
}

const RUBRIC_DIMENSIONS: Array<keyof RubricWeights> = ["completeness", "correctness", "quality", "novelty", "understanding"];

export function ClassEditor({ classId }: { classId: string }) {
  const [classRow, setClassRow] = useState<AdminClassDto | null>(null);
  const [versions, setVersions] = useState<AdminAssignmentVersionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<VersionFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    const res = await fetch(`/api/admin/classes/${classId}`);
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { classRow: AdminClassDto; versions: AdminAssignmentVersionDto[] };
    setClassRow(data.classRow);
    setVersions(data.versions);
    const current = data.versions.find((v) => v.id === data.classRow.currentAssignmentVersionId);
    setForm(versionToForm(current, data.classRow));
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const rubricSum = form ? RUBRIC_DIMENSIONS.reduce((sum, key) => sum + (form.rubricWeights[key] || 0), 0) : 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form || !classRow) return;
    if (rubricSum !== 100) {
      setError("Rubric weights must sum to 100.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const body = {
        classId: classRow.id,
        title: form.title,
        objective: form.objective,
        expectedDeliverables: form.expectedDeliverablesText.split("\n").map((s) => s.trim()).filter(Boolean),
        expectedForkOf: form.expectedForkOf || undefined,
        rubricWeights: form.rubricWeights,
      };

      const url = classRow.currentAssignmentVersionId
        ? `/api/admin/assignment-version/${classRow.currentAssignmentVersionId}`
        : "/api/admin/assignment-version";

      const res = await fetch(url, {
        method: classRow.currentAssignmentVersionId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Failed to publish assignment version.");
        return;
      }
      toast.success("Assignment version published.");
      await loadData();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!classRow || !form) {
    return <p className="text-sm text-destructive">Class not found.</p>;
  }

  return (
    <div className="space-y-6">
      <Link href={`/admin/courses/${classRow.courseId}/classes`} className="text-sm text-muted-foreground hover:underline">
        ← Classes
      </Link>

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{classRow.title}</h1>
        <Badge variant="secondary">{classRow.slug}</Badge>
      </div>

      {/* Mirrors isMultiProjectClass()/isClass03() in lib/graders/class-02.ts and class-03.ts — kept as a literal here to avoid pulling grading logic into the client bundle. */}
      {(classRow.slug === "class-02" || classRow.slug === "class-03") && (
        <Alert>
          <AlertTitle>This class uses a specialized grader</AlertTitle>
          <AlertDescription>
            {classRow.slug === "class-02"
              ? "class-02 is graded by a dedicated multi-project pipeline (see the four Antigravity codelab projects), not the rubric weights below."
              : "class-03 is graded by a dedicated WidgetWare context-package pipeline (config files, agent instructions, context builder, test scenarios, scope discipline), not the rubric weights below."}{" "}
            Title/objective/expected deliverables are still shown to students and given to the grader as context, but the rubric weights
            are unused for this class — any valid values are fine.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{classRow.currentAssignmentVersionId ? "Edit Assignment (publishes a new version)" : "Publish First Assignment Version"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground" htmlFor="version-title">
                Title
              </label>
              <Input
                id="version-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                disabled={saving}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground" htmlFor="version-objective">
                Objective
              </label>
              <textarea
                id="version-objective"
                className={`${fieldClass} min-h-16 py-1.5`}
                value={form.objective}
                onChange={(e) => setForm({ ...form, objective: e.target.value })}
                required
                disabled={saving}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground" htmlFor="version-deliverables">
                Expected Deliverables (one per line)
              </label>
              <textarea
                id="version-deliverables"
                className={`${fieldClass} min-h-28 py-1.5`}
                value={form.expectedDeliverablesText}
                onChange={(e) => setForm({ ...form, expectedDeliverablesText: e.target.value })}
                required
                disabled={saving}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground" htmlFor="version-fork">
                Expected Fork Of (optional)
              </label>
              <Input
                id="version-fork"
                value={form.expectedForkOf}
                onChange={(e) => setForm({ ...form, expectedForkOf: e.target.value })}
                placeholder="owner/repo"
                disabled={saving}
              />
            </div>

            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Rubric Weights</span>
                <span className={`text-sm tabular-nums ${rubricSum === 100 ? "text-muted-foreground" : "text-destructive"}`}>
                  Sum: {rubricSum} / 100
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {RUBRIC_DIMENSIONS.map((dimension) => (
                  <div key={dimension}>
                    <label className="mb-1 block text-xs text-muted-foreground capitalize" htmlFor={`weight-${dimension}`}>
                      {dimension}
                    </label>
                    <Input
                      id={`weight-${dimension}`}
                      type="number"
                      min={0}
                      max={100}
                      value={form.rubricWeights[dimension]}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          rubricWeights: { ...form.rubricWeights, [dimension]: Number(e.target.value) },
                        })
                      }
                      disabled={saving}
                    />
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={saving || rubricSum !== 100} className="w-full sm:w-auto">
              {saving ? "Publishing…" : "Publish New Version"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Version History</CardTitle>
        </CardHeader>
        <CardContent>
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No versions published yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1.5 pr-4 font-medium">Version</th>
                    <th className="py-1.5 pr-4 font-medium">Title</th>
                    <th className="py-1.5 pr-4 font-medium">Rubric</th>
                    <th className="py-1.5 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((version) => (
                    <tr key={version.id} className="border-b last:border-0">
                      <td className="py-1.5 pr-4 tabular-nums">
                        v{version.versionNumber}
                        {version.id === classRow.currentAssignmentVersionId && (
                          <Badge className="ml-2" variant="default">
                            active
                          </Badge>
                        )}
                      </td>
                      <td className="py-1.5 pr-4">{version.title}</td>
                      <td className="py-1.5 pr-4 font-mono text-xs text-muted-foreground">
                        {RUBRIC_DIMENSIONS.map((d) => `${d.slice(0, 4)}:${version.rubricWeights[d]}`).join(" ")}
                      </td>
                      <td className="py-1.5 whitespace-nowrap tabular-nums">{new Date(version.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

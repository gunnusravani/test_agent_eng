"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { gradeColor, scoreToGrade } from "@/lib/grades";
import type { RegradeQueueItem } from "@/types/schemas";

const CONCURRENCY = 3;

type ItemStatus = "queued" | "running" | "done" | "cached" | "skipped" | "error";

interface ItemResult {
  status: ItemStatus;
  grade?: string | null;
  message?: string;
}

function itemKey(item: RegradeQueueItem): string {
  return `${item.studentId}-${item.classId}`;
}

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  async function next(): Promise<void> {
    const i = index++;
    if (i >= items.length) return;
    await worker(items[i]);
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
}

export function RegradeRunner() {
  const [queue, setQueue] = useState<RegradeQueueItem[] | null>(null);
  const [results, setResults] = useState<Record<string, ItemResult>>({});
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetch("/api/admin/regrade-queue")
      .then((res) => res.json())
      .then((data: { items?: RegradeQueueItem[] }) => setQueue(data.items ?? []))
      .catch(() => setQueue([]));
  }, []);

  const countsByClass = useMemo(() => {
    if (!queue) return [];
    const counts = new Map<string, { classTitle: string; count: number }>();
    for (const item of queue) {
      const existing = counts.get(item.classSlug);
      if (existing) existing.count += 1;
      else counts.set(item.classSlug, { classTitle: item.classTitle, count: 1 });
    }
    return [...counts.entries()].map(([classSlug, v]) => ({ classSlug, ...v }));
  }, [queue]);

  const summary = useMemo(() => {
    const values = Object.values(results);
    return {
      done: values.filter((r) => r.status === "done").length,
      cached: values.filter((r) => r.status === "cached").length,
      skipped: values.filter((r) => r.status === "skipped").length,
      error: values.filter((r) => r.status === "error").length,
      total: queue?.length ?? 0,
    };
  }, [results, queue]);

  async function handleRunAll() {
    if (!queue || queue.length === 0) return;
    setRunning(true);
    setResults(Object.fromEntries(queue.map((item) => [itemKey(item), { status: "queued" as const }])));

    await runWithConcurrency(queue, CONCURRENCY, async (item) => {
      const key = itemKey(item);
      setResults((prev) => ({ ...prev, [key]: { status: "running" } }));

      try {
        const res = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseSlug: item.courseSlug, classSlug: item.classSlug, repoUrl: item.repoUrl }),
        });
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          validation?: { valid: boolean; errors: string[] };
          weightedScore?: number | null;
          cached?: boolean;
        } | null;

        if (!res.ok) {
          setResults((prev) => ({ ...prev, [key]: { status: "error", message: body?.error ?? `HTTP ${res.status}` } }));
          return;
        }
        if (!body?.validation?.valid) {
          // Not an error — this student's repo simply doesn't have this particular class's
          // folder (e.g. they've done class-01/02 but never touched class-03). Every possible
          // validation.valid=false reason is exactly this "no matching folder" case, never a
          // real failure, so it's reported as a skip rather than an error.
          setResults((prev) => ({
            ...prev,
            [key]: { status: "skipped", message: body?.validation?.errors?.join(", ") ?? "No matching class folder in this repo." },
          }));
          return;
        }

        const grade = body.weightedScore != null ? scoreToGrade(body.weightedScore) : null;
        setResults((prev) => ({ ...prev, [key]: { status: body.cached ? "cached" : "done", grade } }));
      } catch {
        setResults((prev) => ({ ...prev, [key]: { status: "error", message: "Network error." } }));
      }
    });

    setRunning(false);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Regrade All</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {queue === null ? (
            <p className="text-sm text-muted-foreground">Loading worklist…</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {queue.length === 0
                  ? "No students have submitted anything yet."
                  : `${queue.length} submission${queue.length === 1 ? "" : "s"} to check — ${countsByClass
                      .map((c) => `${c.classSlug}: ${c.count}`)
                      .join(" · ")}.`}
              </p>
              <p className="text-xs text-muted-foreground">
                This checks every student against every class in their course, not just ones they&apos;ve submitted before. A class
                whose folder isn&apos;t in their repo is skipped, not treated as an error. Unchanged repos are graded from cache at no
                cost; only students with new commits since their last grade trigger a fresh LLM call.
              </p>
              <Button onClick={handleRunAll} disabled={running || queue.length === 0}>
                {running ? "Running…" : "Run All Graders"}
              </Button>
              {(running || Object.keys(results).length > 0) && (
                <p className="text-sm text-muted-foreground">
                  {summary.done + summary.cached + summary.skipped + summary.error} / {summary.total} — {summary.done} fresh,{" "}
                  {summary.cached} cached, {summary.skipped} skipped (no folder), {summary.error} errors
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {queue && queue.length > 0 && Object.keys(results).length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1.5 pr-4 font-medium">GitHub Username</th>
                    <th className="py-1.5 pr-4 font-medium">Class</th>
                    <th className="py-1.5 pr-4 font-medium">Status</th>
                    <th className="py-1.5 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((item) => {
                    const result = results[itemKey(item)];
                    return (
                      <tr key={itemKey(item)} className="border-b last:border-0">
                        <td className="py-1.5 pr-4">{item.githubUsername}</td>
                        <td className="py-1.5 pr-4 text-muted-foreground">{item.classSlug}</td>
                        <td className="py-1.5 pr-4">
                          <StatusBadge status={result?.status} />
                        </td>
                        <td className="py-1.5">
                          {result?.status === "error" ? (
                            <span className="text-destructive">{result.message}</span>
                          ) : result?.status === "skipped" ? (
                            <span className="text-muted-foreground">{result.message}</span>
                          ) : result?.grade ? (
                            <span className={`font-medium ${gradeColor(result.grade as Parameters<typeof gradeColor>[0])}`}>
                              {result.grade}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status?: ItemStatus }) {
  if (!status || status === "queued") return <Badge variant="outline">Queued</Badge>;
  if (status === "running") return <Badge variant="secondary">Running…</Badge>;
  if (status === "done") return <Badge>Fresh grade</Badge>;
  if (status === "cached") return <Badge variant="outline">Unchanged</Badge>;
  if (status === "skipped") return <Badge variant="outline">Skipped</Badge>;
  return <Badge variant="destructive">Error</Badge>;
}

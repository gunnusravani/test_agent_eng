"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AssignmentCard } from "@/components/evaluator/assignment-card";
import { MultiProjectResultCard } from "@/components/evaluator/multi-project-result-card";
import { Class03ResultCard } from "@/components/evaluator/class-03-result-card";
import type { AttemptDetailResponse } from "@/types/schemas";

/** Fetches and renders the full stored evaluation for one past attempt — opened by clicking a row in AttemptHistoryTable. */
export function AttemptDetailDialog({
  attemptId,
  onOpenChange,
}: {
  attemptId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [detail, setDetail] = useState<AttemptDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    fetch(`/api/attempts/${attemptId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Could not load this submission.");
        }
        return (await res.json()) as AttemptDetailResponse;
      })
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{detail ? `${detail.classTitle} — Submission Detail` : "Loading…"}</DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!detail && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

        {detail && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              <a href={detail.repoUrl} target="_blank" rel="noreferrer" className="font-mono hover:underline">
                {detail.repoUrl}
              </a>
              <span className="mx-1.5">·</span>
              <span className="font-mono">{detail.commitSha.slice(0, 7)}</span>
              <span className="mx-1.5">·</span>
              {new Date(detail.createdAt).toLocaleString()}
            </div>

            {detail.multiProjectResult ? (
              <MultiProjectResultCard evaluation={detail.multiProjectResult} weightedScore={detail.weightedScore} classTitle={detail.classTitle} />
            ) : detail.class03Result ? (
              <Class03ResultCard evaluation={detail.class03Result} weightedScore={detail.weightedScore} classTitle={detail.classTitle} />
            ) : detail.evaluation ? (
              <AssignmentCard evaluation={detail.evaluation} weightedScore={detail.weightedScore} classTitle={detail.classTitle} />
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

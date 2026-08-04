"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ResultsTable } from "@/components/evaluator/results-table";
import { AttemptHistoryTable } from "@/components/evaluator/attempt-history-table";
import type { AttemptHistoryRow, ResultsRow } from "@/types/schemas";

interface StudentDetailResponse {
  student: { id: string; githubUsername: string; createdAt: string };
  resultsTable: ResultsRow[];
  attemptHistory: AttemptHistoryRow[];
}

export function StudentDetailView({ githubUsername }: { githubUsername: string }) {
  const [data, setData] = useState<StudentDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    fetch(`/api/admin/student/${githubUsername}`)
      .then(async (res) => {
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        const json = (await res.json()) as StudentDetailResponse;
        setData(json);
      })
      .finally(() => setLoading(false));
  }, [githubUsername]);

  return (
    <div className="space-y-6">
      <Link href="/admin/students" className="text-sm text-muted-foreground hover:underline">
        ← Students
      </Link>
      <h1 className="text-2xl font-semibold">{githubUsername}</h1>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : notFound || !data ? (
        <p className="text-sm text-destructive">This student hasn&apos;t submitted anything yet.</p>
      ) : (
        <>
          <ResultsTable rows={data.resultsTable} />
          <AttemptHistoryTable rows={data.attemptHistory} />
        </>
      )}
    </div>
  );
}

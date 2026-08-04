"use client";

import { useState } from "react";
import { toast } from "sonner";
import { RepoUrlForm } from "@/components/evaluator/repo-url-form";
import { ValidationChecklist } from "@/components/evaluator/validation-checklist";
import { Dashboard } from "@/components/evaluator/dashboard";
import { LoadingSkeleton } from "@/components/evaluator/loading-skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { EvaluateResponse, RepositoryReport, ValidationResult } from "@/types/schemas";

type EvaluatorState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "invalid"; validation: ValidationResult }
  | { status: "success"; validation: ValidationResult; report: RepositoryReport }
  | { status: "error"; message: string };

export function EvaluatorApp() {
  const [state, setState] = useState<EvaluatorState>({ status: "idle" });

  async function handleSubmit(url: string) {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
        const message = body?.error ?? `Request failed with status ${response.status}`;
        if (body?.code === "RATE_LIMITED") {
          toast.warning("GitHub rate limit hit — add a GITHUB_TOKEN to raise the limit.");
        }
        setState({ status: "error", message });
        return;
      }

      const data = (await response.json()) as EvaluateResponse;

      if (!data.validation.valid || !data.report) {
        setState({ status: "invalid", validation: data.validation });
        return;
      }

      setState({ status: "success", validation: data.validation, report: data.report });
    } catch {
      setState({ status: "error", message: "Network error — could not reach the evaluation service." });
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Assignment Repository Evaluator</h1>
        <p className="text-muted-foreground">
          Enter a public GitHub repository URL to validate its structure and get an AI-generated evaluation of every
          class assignment.
        </p>
      </div>

      <RepoUrlForm onSubmit={handleSubmit} isLoading={state.status === "loading"} />

      {state.status === "loading" && <LoadingSkeleton />}

      {state.status === "invalid" && <ValidationChecklist validation={state.validation} />}

      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {state.status === "success" && <Dashboard report={state.report} />}
    </div>
  );
}

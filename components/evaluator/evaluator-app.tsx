"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CourseClassPicker } from "@/components/evaluator/course-class-picker";
import { RepoUrlForm } from "@/components/evaluator/repo-url-form";
import { ValidationChecklist } from "@/components/evaluator/validation-checklist";
import { Dashboard } from "@/components/evaluator/dashboard";
import { LoadingSkeleton } from "@/components/evaluator/loading-skeleton";
import { ResultsLookupForm } from "@/components/evaluator/results-lookup-form";
import { ResultsTable } from "@/components/evaluator/results-table";
import { AttemptHistoryTable } from "@/components/evaluator/attempt-history-table";
import { ClassLeaderboard } from "@/components/evaluator/class-leaderboard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import type {
  AssignmentEvaluationResult,
  AttemptHistoryRow,
  Class02aEvaluationResult,
  Class02bEvaluationResult,
  Class03EvaluationResult,
  ClassFilesDto,
  EvaluateResponse,
  MultiProjectEvaluationResult,
  ResultsRow,
  ValidationResult,
} from "@/types/schemas";

type EvaluatorState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "invalid"; validation: ValidationResult }
  | {
      status: "success";
      validation: ValidationResult;
      evaluation?: AssignmentEvaluationResult;
      multiProjectResult?: MultiProjectEvaluationResult;
      class03Result?: Class03EvaluationResult;
      class02aResult?: Class02aEvaluationResult;
      class02bResult?: Class02bEvaluationResult;
      weightedScore: number | null;
      files?: ClassFilesDto;
      resultsTable: ResultsRow[];
      attemptHistory: AttemptHistoryRow[];
      classTitle: string;
      cached: boolean;
    }
  | { status: "error"; message: string };

export function EvaluatorApp() {
  const [courseSlug, setCourseSlug] = useState<string | null>(null);
  const [classSlug, setClassSlug] = useState<string | null>(null);
  const [classTitle, setClassTitle] = useState("");
  const [state, setState] = useState<EvaluatorState>({ status: "idle" });

  const [lookupResults, setLookupResults] = useState<ResultsRow[] | null>(null);
  const [lookupHistory, setLookupHistory] = useState<AttemptHistoryRow[] | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  async function handleSubmit(repoUrl: string) {
    if (!courseSlug || !classSlug) {
      toast.error("Choose a course and class first.");
      return;
    }

    setState({ status: "loading" });
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseSlug, classSlug, repoUrl }),
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

      if (
        !data.validation.valid ||
        (!data.evaluation && !data.multiProjectResult && !data.class03Result && !data.class02aResult && !data.class02bResult)
      ) {
        setState({ status: "invalid", validation: data.validation });
        return;
      }

      setState({
        status: "success",
        validation: data.validation,
        evaluation: data.evaluation,
        multiProjectResult: data.multiProjectResult,
        class03Result: data.class03Result,
        class02aResult: data.class02aResult,
        class02bResult: data.class02bResult,
        weightedScore: data.weightedScore ?? null,
        files: data.files,
        resultsTable: data.resultsTable ?? [],
        attemptHistory: data.attemptHistory ?? [],
        classTitle,
        cached: data.cached ?? false,
      });
    } catch {
      setState({ status: "error", message: "Network error — could not reach the evaluation service." });
    }
  }

  async function handleLookup(githubUsername: string) {
    setLookupLoading(true);
    try {
      const params = new URLSearchParams({ githubUsername });
      if (courseSlug) params.set("courseSlug", courseSlug);
      const response = await fetch(`/api/results?${params.toString()}`);
      const data = (await response.json().catch(() => null)) as {
        resultsTable?: ResultsRow[];
        attemptHistory?: AttemptHistoryRow[];
        error?: string;
      } | null;
      if (!response.ok) {
        toast.error(data?.error ?? "Could not load results.");
        return;
      }
      setLookupResults(data?.resultsTable ?? []);
      setLookupHistory(data?.attemptHistory ?? []);
    } catch {
      toast.error("Network error — could not reach the results service.");
    } finally {
      setLookupLoading(false);
    }
  }

  return (
    <div id="grade-form" className="mx-auto flex w-full max-w-5xl scroll-mt-20 flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">Submit Your Repository</h2>
        <p className="text-muted-foreground">
          Choose a course and class, then submit your GitHub repository for an AI-generated evaluation.
        </p>
      </div>

      <CourseClassPicker
        courseSlug={courseSlug}
        classSlug={classSlug}
        disabled={state.status === "loading"}
        onCourseChange={(slug) => {
          setCourseSlug(slug);
          setClassSlug(null);
          setClassTitle("");
        }}
        onClassChange={(slug, title) => {
          setClassSlug(slug);
          setClassTitle(title);
        }}
      />

      <RepoUrlForm onSubmit={handleSubmit} isLoading={state.status === "loading"} />

      {state.status === "loading" && <LoadingSkeleton />}

      {state.status === "invalid" && <ValidationChecklist validation={state.validation} />}

      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {state.status === "success" && (
        <>
          {state.cached && (
            <Alert>
              <AlertTitle>This repository hasn&apos;t changed</AlertTitle>
              <AlertDescription>
                Showing your existing result for this commit — nothing new was submitted, so this wasn&apos;t re-graded.
              </AlertDescription>
            </Alert>
          )}
          <Dashboard
            validation={state.validation}
            evaluation={state.evaluation}
            multiProjectResult={state.multiProjectResult}
            class03Result={state.class03Result}
            class02aResult={state.class02aResult}
            class02bResult={state.class02bResult}
            weightedScore={state.weightedScore}
            classTitle={state.classTitle}
            files={state.files}
            resultsTable={state.resultsTable}
            attemptHistory={state.attemptHistory}
          />
        </>
      )}

      <Separator />

      <div id="check-results" className="scroll-mt-20 space-y-3">
        <h2 className="text-lg font-semibold">Check Your Results</h2>
        <p className="text-sm text-muted-foreground">Look up your grading history by GitHub username, any time.</p>
        <ResultsLookupForm onLookup={handleLookup} isLoading={lookupLoading} />
        {lookupResults && <ResultsTable rows={lookupResults} />}
        {lookupHistory && <AttemptHistoryTable rows={lookupHistory} />}
      </div>

      {courseSlug && (
        <>
          <Separator />
          <div id="leaderboard" className="scroll-mt-20 space-y-3">
            <h2 className="text-lg font-semibold">Class Leaderboard</h2>
            <p className="text-sm text-muted-foreground">Every student&apos;s standing, class by class, top grader first.</p>
            <ClassLeaderboard courseSlug={courseSlug} />
          </div>
        </>
      )}
    </div>
  );
}

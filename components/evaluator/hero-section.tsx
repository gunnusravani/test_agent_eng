"use client";

import { ZapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function HeroSection() {
  return (
    <section className="bg-zinc-950 text-white">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 py-20 text-center sm:px-6">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-3.5 py-1.5 text-sm font-medium text-blue-300 ring-1 ring-blue-400/30">
          <ZapIcon className="size-3.5" />
          AI-Powered Instant Grading
        </span>

        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          Get Your Assignment <span className="text-blue-400">Graded Instantly</span>
        </h1>

        <p className="max-w-2xl text-lg text-balance text-zinc-400">
          Paste your GitHub repository and get a detailed, rubric-based AI evaluation in under a
          minute — real scores, real feedback, no waiting in a grading queue.
        </p>

        <div className="mt-2 grid grid-cols-3 gap-8 sm:gap-16">
          <Stat value="5" label="Scoring Dimensions" />
          <Stat value="<1 min" label="Typical Turnaround" />
          <Stat value="∞" label="Resubmissions Allowed" />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            className="h-11 rounded-full bg-blue-500 px-6 text-base font-semibold text-white hover:bg-blue-400"
            onClick={() => scrollToId("grade-form")}
          >
            Grade My Repository →
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 rounded-full border-zinc-700 bg-transparent px-6 text-base font-semibold text-white hover:bg-white/10"
            onClick={() => scrollToId("check-results")}
          >
            Check My Results
          </Button>
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-bold text-blue-400 sm:text-3xl">{value}</div>
      <div className="mt-1 text-xs text-zinc-500 sm:text-sm">{label}</div>
    </div>
  );
}

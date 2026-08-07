"use client";

import { Button } from "@/components/ui/button";
import { DownloadIcon } from "lucide-react";
import { downloadTextFile } from "@/lib/export";
import type { Class03EvaluationResult } from "@/types/schemas";

export function Class03ExportButton({
  evaluation,
  owner,
  repo,
  classSlug,
}: {
  evaluation: Class03EvaluationResult;
  owner: string;
  repo: string;
  classSlug: string;
}) {
  return (
    <Button
      variant="outline"
      onClick={() =>
        downloadTextFile(`${owner}-${repo}-${classSlug}-evaluation.json`, JSON.stringify(evaluation, null, 2), "application/json")
      }
    >
      <DownloadIcon />
      Download JSON
    </Button>
  );
}

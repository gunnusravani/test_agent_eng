"use client";

import { Button } from "@/components/ui/button";
import { DownloadIcon } from "lucide-react";
import { downloadTextFile } from "@/lib/export";
import type { Class02aEvaluationResult } from "@/types/schemas";

export function Class02aExportButton({
  evaluation,
  owner,
  repo,
  classSlug,
}: {
  evaluation: Class02aEvaluationResult;
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

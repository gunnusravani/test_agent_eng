"use client";

import { Button } from "@/components/ui/button";
import { DownloadIcon } from "lucide-react";
import { buildJsonReport, buildMarkdownReport, downloadTextFile } from "@/lib/export";
import type { RepositoryReport } from "@/types/schemas";

export function ExportButtons({ report }: { report: RepositoryReport }) {
  const filenameBase = `${report.repository.owner}-${report.repository.repo}-evaluation`;

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        onClick={() => downloadTextFile(`${filenameBase}.json`, buildJsonReport(report), "application/json")}
      >
        <DownloadIcon />
        Download JSON
      </Button>
      <Button
        variant="outline"
        onClick={() => downloadTextFile(`${filenameBase}.md`, buildMarkdownReport(report), "text/markdown")}
      >
        <DownloadIcon />
        Download Markdown Report
      </Button>
    </div>
  );
}

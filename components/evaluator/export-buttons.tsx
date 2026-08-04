"use client";

import { Button } from "@/components/ui/button";
import { DownloadIcon } from "lucide-react";
import { buildJsonReport, buildMarkdownReport, downloadTextFile, type ExportContext } from "@/lib/export";

export function ExportButtons({ context }: { context: ExportContext }) {
  const filenameBase = `${context.owner}-${context.repo}-${context.classSlug}-evaluation`;

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        onClick={() => downloadTextFile(`${filenameBase}.json`, buildJsonReport(context), "application/json")}
      >
        <DownloadIcon />
        Download JSON
      </Button>
      <Button
        variant="outline"
        onClick={() => downloadTextFile(`${filenameBase}.md`, buildMarkdownReport(context), "text/markdown")}
      >
        <DownloadIcon />
        Download Markdown Report
      </Button>
    </div>
  );
}

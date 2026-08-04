"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileTextIcon } from "lucide-react";
import type { GatheredFileDto } from "@/types/schemas";

export function FilePreviewDialog({ file }: { file: GatheredFileDto }) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="font-mono text-xs">
            <FileTextIcon />
            {file.path}
          </Button>
        }
      />
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm break-all">{file.path}</DialogTitle>
        </DialogHeader>
        {file.truncated && (
          <p className="text-xs text-muted-foreground">This file was truncated to fit the evaluation context budget.</p>
        )}
        <pre className="max-h-[60vh] overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
          <code>{file.content}</code>
        </pre>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { repoUrlSchema } from "@/types/schemas";
import { Loader2Icon } from "lucide-react";

export function RepoUrlForm({
  onSubmit,
  isLoading,
}: {
  onSubmit: (url: string) => void;
  isLoading: boolean;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = repoUrlSchema.safeParse({ url });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Invalid URL");
      return;
    }
    setError(null);
    onSubmit(url.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-2 sm:flex-row sm:items-start">
      <div className="flex-1">
        <Input
          type="text"
          placeholder="https://github.com/user/repository"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isLoading}
          aria-label="GitHub Repository URL"
          aria-invalid={Boolean(error)}
        />
        {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}
      </div>
      <Button type="submit" disabled={isLoading} className="sm:w-auto">
        {isLoading && <Loader2Icon className="animate-spin" />}
        {isLoading ? "Evaluating…" : "Evaluate Repository"}
      </Button>
    </form>
  );
}

"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2Icon } from "lucide-react";

export function ResultsLookupForm({
  onLookup,
  isLoading,
}: {
  onLookup: (githubUsername: string) => void;
  isLoading: boolean;
}) {
  const [username, setUsername] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) return;
    onLookup(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-2 sm:flex-row sm:items-start">
      <div className="flex-1">
        <Input
          type="text"
          placeholder="GitHub username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={isLoading}
          aria-label="GitHub username"
        />
      </div>
      <Button type="submit" variant="outline" disabled={isLoading} className="sm:w-auto">
        {isLoading && <Loader2Icon className="animate-spin" />}
        View My Results
      </Button>
    </form>
  );
}

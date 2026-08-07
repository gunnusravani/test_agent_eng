"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { gradeColor } from "@/lib/grades";
import type { LeaderboardClassDto } from "@/types/schemas";

/** Public, course-wide leaderboard: every student's standing in every class, ranked top grader first. */
export function ClassLeaderboard({ courseSlug }: { courseSlug: string }) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardClassDto[] | null>(null);

  useEffect(() => {
    setLeaderboard(null);
    fetch(`/api/leaderboard?courseSlug=${encodeURIComponent(courseSlug)}`)
      .then((res) => res.json())
      .then((data: { leaderboard?: LeaderboardClassDto[] }) => setLeaderboard(data.leaderboard ?? []))
      .catch(() => setLeaderboard([]));
  }, [courseSlug]);

  if (leaderboard === null) {
    return <p className="text-sm text-muted-foreground">Loading leaderboard…</p>;
  }

  if (leaderboard.length === 0) {
    return <p className="text-sm text-muted-foreground">No graded submissions yet for this course.</p>;
  }

  return (
    <div className="space-y-4">
      {leaderboard.map((classGroup) => (
        <Card key={classGroup.classId}>
          <CardHeader>
            <CardTitle>{classGroup.classTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1.5 pr-4 font-medium">Rank</th>
                    <th className="py-1.5 pr-4 font-medium">GitHub Username</th>
                    <th className="py-1.5 pr-4 font-medium">Latest Grade</th>
                    <th className="py-1.5 pr-4 font-medium">Best Grade</th>
                    <th className="py-1.5 font-medium">Attempts</th>
                  </tr>
                </thead>
                <tbody>
                  {classGroup.entries.map((entry) => (
                    <tr key={entry.studentId} className="border-b last:border-0">
                      <td className="py-1.5 pr-4 tabular-nums text-muted-foreground">
                        {entry.rank === 1 ? "🏆 1" : entry.rank}
                      </td>
                      <td className="py-1.5 pr-4">{entry.githubUsername}</td>
                      <td className={`py-1.5 pr-4 font-medium ${gradeColor(entry.latestGrade)}`}>{entry.latestGrade}</td>
                      <td className={`py-1.5 pr-4 font-medium ${gradeColor(entry.maxGrade)}`}>{entry.maxGrade}</td>
                      <td className="py-1.5 tabular-nums">{entry.attempts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

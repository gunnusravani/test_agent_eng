"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/charts/stat-tile";
import { Meter } from "@/components/charts/meter";
import { BarChart } from "@/components/charts/bar-chart";
import { LineChart } from "@/components/charts/line-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { gradeColor } from "@/lib/grades";
import type { DashboardAnalytics } from "@/types/schemas";

const BLUE = "#2a78d6";
// Categorical slots 1-6 from the validated dataviz palette, fixed order — never cycled.
const CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const OTHER_GRAY = "#898781";

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AnalyticsDashboard() {
  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((res) => res.json())
      .then((json: DashboardAnalytics) => setData(json))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading dashboard…</p>;
  }
  if (!data) {
    return <p className="text-sm text-destructive">Could not load analytics.</p>;
  }

  const { kpis, gradeDistribution, avgScorePerCourse, submissionsByCourse, attemptsOverTime, classPerformance, recentSubmissions } = data;

  const mostAttempted = classPerformance[0] ?? null;
  const mostFailed = classPerformance.length > 0 ? [...classPerformance].sort((a, b) => a.passRate - b.passRate)[0] : null;

  const donutData = submissionsByCourse.slice(0, 6).map((c, i) => ({ label: c.courseTitle, value: c.count, color: CATEGORICAL[i] }));
  if (submissionsByCourse.length > 6) {
    const otherCount = submissionsByCourse.slice(6).reduce((sum, c) => sum + c.count, 0);
    donutData.push({ label: "Other", value: otherCount, color: OTHER_GRAY });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Total students" value={kpis.totalStudents.toLocaleString()} />
        <StatTile label="Total submissions" value={kpis.totalSubmissions.toLocaleString()} />
        <StatTile label="Pass rate" value={`${kpis.passPercentage.toFixed(0)}%`} accent />
        <StatTile label="Avg attempts per class" value={kpis.avgAttemptsPerClass.toFixed(1)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Grade Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {gradeDistribution.every((g) => g.count === 0) ? (
              <p className="text-sm text-muted-foreground">No graded submissions yet.</p>
            ) : (
              <BarChart data={gradeDistribution.map((g) => ({ label: g.grade, value: g.count }))} color={BLUE} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Submissions by Course</CardTitle>
          </CardHeader>
          <CardContent>
            {submissionsByCourse.length === 0 ? (
              <p className="text-sm text-muted-foreground">No submissions yet.</p>
            ) : (
              <DonutChart data={donutData} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Average Score by Course</CardTitle>
          </CardHeader>
          <CardContent>
            {avgScorePerCourse.length === 0 ? (
              <p className="text-sm text-muted-foreground">No successful submissions yet.</p>
            ) : (
              <BarChart
                data={avgScorePerCourse.map((c) => ({ label: c.courseTitle, value: c.avgScore ?? 0 }))}
                color={BLUE}
                valueFormat={(v) => v.toFixed(1)}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Submissions — Last 30 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart data={attemptsOverTime.map((d) => ({ label: formatDay(d.date), value: d.count }))} color={BLUE} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Class Performance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {classPerformance.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attempts yet.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 text-sm">
                {mostAttempted && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1">
                    <Badge variant="secondary">Most attempted</Badge>
                    {mostAttempted.classTitle} ({mostAttempted.attempts})
                  </span>
                )}
                {mostFailed && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1">
                    <Badge variant="destructive">Lowest pass rate</Badge>
                    {mostFailed.classTitle} ({mostFailed.passRate.toFixed(0)}%)
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1.5 pr-4 font-medium">Class</th>
                      <th className="py-1.5 pr-4 font-medium">Course</th>
                      <th className="py-1.5 pr-4 font-medium">Attempts</th>
                      <th className="py-1.5 pr-4 font-medium">Avg Score</th>
                      <th className="py-1.5 font-medium">Pass Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classPerformance.map((row) => (
                      <tr key={row.classId} className="border-b last:border-0">
                        <td className="py-1.5 pr-4">{row.classTitle}</td>
                        <td className="py-1.5 pr-4 text-muted-foreground">{row.courseTitle}</td>
                        <td className="py-1.5 pr-4 tabular-nums">{row.attempts}</td>
                        <td className="py-1.5 pr-4 tabular-nums">{row.avgScore != null ? row.avgScore.toFixed(1) : "—"}</td>
                        <td className="w-40 py-1.5">
                          <Meter label="" percentage={row.passRate} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Submissions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentSubmissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No submissions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1.5 pr-4 font-medium">Time</th>
                    <th className="py-1.5 pr-4 font-medium">Student</th>
                    <th className="py-1.5 pr-4 font-medium">Course</th>
                    <th className="py-1.5 pr-4 font-medium">Class</th>
                    <th className="py-1.5 pr-4 font-medium">Status</th>
                    <th className="py-1.5 font-medium">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSubmissions.map((row) => (
                    <tr key={row.attemptId} className="border-b last:border-0">
                      <td className="py-1.5 pr-4 whitespace-nowrap tabular-nums">{new Date(row.createdAt).toLocaleString()}</td>
                      <td className="py-1.5 pr-4">{row.githubUsername}</td>
                      <td className="py-1.5 pr-4 text-muted-foreground">{row.courseTitle}</td>
                      <td className="py-1.5 pr-4 text-muted-foreground">{row.classTitle}</td>
                      <td className="py-1.5 pr-4">
                        {row.status === "error" ? (
                          <Badge variant="destructive">Error</Badge>
                        ) : (
                          <Badge variant="outline">Success</Badge>
                        )}
                      </td>
                      <td className={`py-1.5 font-medium ${row.grade ? gradeColor(row.grade) : ""}`}>{row.grade ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

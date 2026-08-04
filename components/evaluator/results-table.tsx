import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { gradeColor } from "@/lib/grades";
import type { ResultsRow } from "@/types/schemas";

export function ResultsTable({ rows }: { rows: ResultsRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Results</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No submissions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5 pr-4 font-medium">Class</th>
                  <th className="py-1.5 pr-4 font-medium">Max Grade</th>
                  <th className="py-1.5 pr-4 font-medium">Latest Grade</th>
                  <th className="py-1.5 font-medium">Attempts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.classId} className="border-b last:border-0">
                    <td className="py-1.5 pr-4">{row.classTitle}</td>
                    <td className={`py-1.5 pr-4 font-medium ${gradeColor(row.maxGrade)}`}>{row.maxGrade}</td>
                    <td className={`py-1.5 pr-4 font-medium ${gradeColor(row.latestGrade)}`}>{row.latestGrade}</td>
                    <td className="py-1.5 tabular-nums">{row.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { gradeColor } from "@/lib/grades";
import type { AttemptHistoryRow } from "@/types/schemas";

export function AttemptHistoryTable({ rows }: { rows: AttemptHistoryRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Previous Runs</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No previous runs.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5 pr-4 font-medium">Time</th>
                  <th className="py-1.5 pr-4 font-medium">Class</th>
                  <th className="py-1.5 pr-4 font-medium">Status</th>
                  <th className="py-1.5 pr-4 font-medium">Grade</th>
                  <th className="py-1.5 font-medium">Result Description</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.attemptId} className="border-b last:border-0">
                    {/* toLocaleString() runs client-side, so this renders in the viewer's own local time zone. */}
                    <td className="py-1.5 pr-4 whitespace-nowrap tabular-nums">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="py-1.5 pr-4">{row.classTitle}</td>
                    <td className="py-1.5 pr-4">
                      {row.status === "error" ? (
                        <Badge variant="destructive">Error</Badge>
                      ) : (
                        <Badge variant="outline">Success</Badge>
                      )}
                    </td>
                    <td className={`py-1.5 pr-4 font-medium ${row.grade ? gradeColor(row.grade) : ""}`}>{row.grade ?? "—"}</td>
                    <td className="max-w-56 py-1.5">
                      {row.description ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span className="block cursor-default truncate text-muted-foreground">{row.description}</span>
                            }
                          />
                          <TooltipContent side="top" className="max-w-sm text-pretty whitespace-pre-wrap">
                            {row.description}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
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

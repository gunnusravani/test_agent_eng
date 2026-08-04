import { CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ValidationResult } from "@/types/schemas";

export function ValidationChecklist({ validation }: { validation: ValidationResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Repository Structure</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!validation.valid && (
          <Alert variant="destructive">
            <AlertTitle>Repository structure is invalid</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {validation.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <ChecklistLine ok={validation.hasReadme} label="README.md present" />
          <ChecklistLine ok={validation.hasMyWork} label="my-work/ directory present" />
          {validation.forkCheck && (
            <ChecklistLine
              ok={validation.forkCheck.ok}
              label={
                validation.forkCheck.ok
                  ? `Forked from ${validation.forkCheck.expectedUpstream}`
                  : `Not forked from ${validation.forkCheck.expectedUpstream}${
                      validation.forkCheck.actualUpstream ? ` (found: ${validation.forkCheck.actualUpstream})` : " (not a fork)"
                    }`
              }
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3 md:grid-cols-5">
          {validation.classes.map((item) => (
            <ChecklistLine
              key={item.classId}
              ok={item.present}
              label={item.present ? item.classId : `${item.classId} missing`}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ChecklistLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {ok ? (
        <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <XCircleIcon className="size-4 shrink-0 text-red-600 dark:text-red-400" />
      )}
      <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

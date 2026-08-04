import type { RepositoryReport } from "@/types/schemas";

export interface ReportStore {
  saveReport(report: RepositoryReport): Promise<string>;
  getReport(id: string): Promise<RepositoryReport | null>;
  listReports(): Promise<RepositoryReport[]>;
}

/**
 * In-memory implementation used for the MVP. The full report already flows
 * back to the client in the API response, so nothing depends on this map for
 * correctness — it exists only to prove the persistence seam. It is also
 * per-instance and ephemeral on serverless deployments.
 *
 * To add real persistence later (e.g. Supabase/Postgres), implement
 * ReportStore against that backend and swap the singleton below — no
 * changes needed at call sites (lib/evaluator.ts, app/api/evaluate/route.ts).
 */
class InMemoryReportStore implements ReportStore {
  private reports = new Map<string, RepositoryReport>();

  async saveReport(report: RepositoryReport): Promise<string> {
    const id = crypto.randomUUID();
    this.reports.set(id, report);
    return id;
  }

  async getReport(id: string): Promise<RepositoryReport | null> {
    return this.reports.get(id) ?? null;
  }

  async listReports(): Promise<RepositoryReport[]> {
    return [...this.reports.values()];
  }
}

export const reportStore: ReportStore = new InMemoryReportStore();

export interface AssignmentConfig {
  title: string;
  objective: string;
  expectedDeliverables: string[];
  /** If set, the repo must be a GitHub fork of this "owner/repo" upstream (checked deterministically via the GitHub API, not by the LLM). */
  expectedForkOf?: string;
}

export type FileCategory = "source" | "markdown" | "notebook" | "binary" | "other";

export interface GatheredFile {
  path: string;
  category: FileCategory;
  content: string;
  truncated: boolean;
}

export interface OmittedFile {
  path: string;
  sizeBytes?: number;
  reason: "binary" | "budget";
}

export interface GatheredClass {
  classId: string;
  present: boolean;
  hasReadme: boolean;
  filesIncluded: GatheredFile[];
  filesOmitted: OmittedFile[];
  totalCharsUsed: number;
}

export * from "./schemas";

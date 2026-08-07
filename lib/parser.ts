import pLimit from "p-limit";
import { readFileContent, type GitTreeItem } from "./github";
import type { FileCategory, GatheredClass, GatheredFile, OmittedFile } from "@/types";

export const IGNORED_DIR_SEGMENTS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "venv",
  ".venv",
  "env",
  "__pycache__",
  ".git",
  "target",
  "coverage",
  ".next",
  ".idea",
  ".vscode",
  ".pytest_cache",
  ".mypy_cache",
  ".cache",
]);

export function isIgnoredPath(path: string): boolean {
  return path.split("/").some((segment) => IGNORED_DIR_SEGMENTS.has(segment));
}

const SOURCE_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs",
  "py", "java", "c", "cpp", "cc", "h", "hpp",
  "go", "rs", "rb", "php", "cs", "swift", "kt",
  "html", "css", "scss", "sql", "sh", "json", "yaml", "yml",
  "txt", "toml", "cfg", "ini", "env", "csv",
]);

export function classifyFile(path: string): FileCategory {
  const lower = path.toLowerCase();
  const ext = lower.split(".").pop() ?? "";

  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "ipynb") return "notebook";
  if (["pdf", "png", "jpg", "jpeg", "gif", "svg", "bmp", "ico", "zip", "tar", "gz", "class", "pyc", "exe", "bin"].includes(ext)) {
    return "binary";
  }
  if (SOURCE_EXTENSIONS.has(ext)) return "source";
  return "other";
}

export const MAX_FILE_CHARS = Number(process.env.MAX_FILE_CHARS ?? 8000);
export const MAX_CONTEXT_CHARS_PER_CLASS = Number(process.env.MAX_CONTEXT_CHARS_PER_CLASS ?? 40000);

/** Keeps the head and tail of a file (imports/setup usually live at the top, results/conclusions at the bottom). */
export function truncateFile(content: string, maxChars: number = MAX_FILE_CHARS): { content: string; truncated: boolean } {
  if (content.length <= maxChars) return { content, truncated: false };

  const headChars = Math.floor(maxChars * 0.7);
  const tailChars = maxChars - headChars;
  const omitted = content.length - maxChars;
  const head = content.slice(0, headChars);
  const tail = content.slice(content.length - tailChars);

  return {
    content: `${head}\n\n... [truncated ${omitted} chars] ...\n\n${tail}`,
    truncated: true,
  };
}

interface NotebookCell {
  cell_type?: string;
  source?: string[] | string;
}

/** Extracts markdown/code cell source from a Jupyter notebook, dropping outputs (can carry huge base64 image blobs). */
export function parseNotebook(raw: string): string {
  try {
    const notebook = JSON.parse(raw) as { cells?: NotebookCell[] };
    const cells = notebook.cells ?? [];
    return cells
      .map((cell) => {
        const source = Array.isArray(cell.source) ? cell.source.join("") : (cell.source ?? "");
        const label = cell.cell_type === "markdown" ? "[markdown cell]" : "[code cell]";
        return `${label}\n${source}`;
      })
      .join("\n\n---\n\n");
  } catch {
    // If the notebook JSON is malformed, fall back to raw content (still truncated downstream).
    return raw;
  }
}

const CATEGORY_PRIORITY: Record<FileCategory, number> = {
  markdown: 0,
  source: 1,
  notebook: 2,
  other: 3,
  binary: 4,
};

export interface GatheredFiles {
  present: boolean;
  hasReadme: boolean;
  filesIncluded: GatheredFile[];
  filesOmitted: OmittedFile[];
  totalCharsUsed: number;
}

/**
 * Fetches, classifies, and budget-truncates every reviewable file under an arbitrary
 * tree path prefix. This is the shared engine behind gatherClassFiles (one class,
 * my-work/{classId}/) and the class-02 grader (one project subfolder at a time,
 * my-work/class-02/agy2-pprojects/{project}/) — same rules, different budget per caller.
 */
export async function gatherFilesUnderPrefix(params: {
  owner: string;
  repo: string;
  tree: GitTreeItem[];
  pathPrefix: string;
  budgetChars?: number;
}): Promise<GatheredFiles> {
  const { owner, repo, tree, pathPrefix, budgetChars = MAX_CONTEXT_CHARS_PER_CLASS } = params;

  const entries = tree.filter(
    (item) => item.type === "blob" && item.path.startsWith(pathPrefix) && !isIgnoredPath(item.path),
  );

  if (entries.length === 0) {
    return { present: false, hasReadme: false, filesIncluded: [], filesOmitted: [], totalCharsUsed: 0 };
  }

  const hasReadme = entries.some((e) => /(^|\/)readme\.md$/i.test(e.path));

  const classified = entries.map((entry) => ({ entry, category: classifyFile(entry.path) }));

  const includable = classified.filter((c) => c.category !== "binary" && c.category !== "other");
  const excluded: OmittedFile[] = classified
    .filter((c) => c.category === "binary" || c.category === "other")
    .map((c) => ({ path: c.entry.path, sizeBytes: c.entry.size, reason: "binary" as const }));

  includable.sort((a, b) => {
    const priorityDiff = CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category];
    if (priorityDiff !== 0) return priorityDiff;
    return (a.entry.size ?? 0) - (b.entry.size ?? 0);
  });

  const limit = pLimit(6);
  const fetched = await Promise.all(
    includable.map((item) =>
      limit(async () => {
        const raw = await readFileContent(owner, repo, item.entry.sha);
        const content = item.category === "notebook" ? parseNotebook(raw) : raw;
        return { path: item.entry.path, category: item.category, content };
      }),
    ),
  );

  const filesIncluded: GatheredFile[] = [];
  const filesOmitted: OmittedFile[] = [...excluded];
  let totalCharsUsed = 0;

  for (const file of fetched) {
    const remainingBudget = budgetChars - totalCharsUsed;
    if (remainingBudget <= 0) {
      filesOmitted.push({ path: file.path, sizeBytes: file.content.length, reason: "budget" });
      continue;
    }

    const perFileCap = Math.min(MAX_FILE_CHARS, remainingBudget);
    const { content, truncated } = truncateFile(file.content, perFileCap);
    filesIncluded.push({ path: file.path, category: file.category, content, truncated });
    totalCharsUsed += content.length;
  }

  return { present: true, hasReadme, filesIncluded, filesOmitted, totalCharsUsed };
}

export async function gatherClassFiles(params: {
  owner: string;
  repo: string;
  tree: GitTreeItem[];
  classId: string;
  myWorkPath: string;
}): Promise<GatheredClass> {
  const { owner, repo, tree, classId, myWorkPath } = params;
  const result = await gatherFilesUnderPrefix({ owner, repo, tree, pathPrefix: `${myWorkPath}/${classId}/` });
  return { classId, ...result };
}

import { MODEL_NAME, generateObjectWithRetry } from "@/lib/evaluator";
import { buildRetryPrompt } from "@/lib/prompts";
import { gatherFilesUnderPrefix, truncateFile, type GatheredFiles } from "@/lib/parser";
import { readFileContent, type GitTreeItem } from "@/lib/github";
import { multiProjectEvaluationSchema, type MultiProjectEvaluation, type MultiProjectEvaluationResult, type MultiProjectResult } from "@/types/schemas";
import type { AssignmentConfig } from "@/types";

export const CLASS_02_SLUG = "class-02";
const AGY2_PROJECTS_DIR = "agy2-pprojects";
const MAX_CONTEXT_CHARS_PER_PROJECT = Number(process.env.MAX_CONTEXT_CHARS_PER_PROJECT ?? 15000);

export function isMultiProjectClass(classSlug: string): boolean {
  return classSlug === CLASS_02_SLUG;
}

/**
 * The spec's rubric numbers live here, not in the DB — this grader is intentionally
 * hardcoded to class-02. `aliases` exist because real student repos vary in folder
 * naming (verified against live submissions: "unit-tests-mocks" instead of
 * "mock-stubs" is a real example) — the canonical name is tried first, then these.
 */
const PROJECT_DEFS = [
  {
    key: "newsHighlights",
    folder: "news-highlights",
    aliases: [/news/i, /highlight/i],
    maxScore: 10,
    label: "News Highlights",
    nominalFileBaseline: 1,
  },
  {
    key: "conferenceWebsite",
    folder: "conference-website",
    aliases: [/conference/i],
    maxScore: 30,
    label: "Conference Website",
    nominalFileBaseline: 5,
  },
  {
    key: "mockStubs",
    folder: "mock-stubs",
    aliases: [/mock/i, /stub/i],
    maxScore: 20,
    label: "Mock Stubs",
    nominalFileBaseline: 2,
  },
  {
    key: "pomodoroTimer",
    folder: "pomodoro-timer",
    aliases: [/pomodoro/i, /timer/i],
    maxScore: 25,
    label: "Pomodoro Timer",
    nominalFileBaseline: 4,
  },
] as const;

type ProjectKey = (typeof PROJECT_DEFS)[number]["key"];

const README_MAX_SCORE = 15;

function hasDirectoryAt(tree: GitTreeItem[], path: string): boolean {
  return tree.some((item) => item.type === "tree" && item.path.toLowerCase() === path.toLowerCase());
}

/**
 * Resolves which actual folder under agy2-pprojects corresponds to a project def:
 * the canonical name first, then a direct-child folder matching one of its alias
 * patterns. Returns null if nothing matches — that project is then genuinely absent
 * and scores accordingly, but (per design) doesn't block grading the rest of the
 * submission. Only checks direct children of agy2-pprojects, not nested placements —
 * a project buried an extra folder deep (also seen in real repos) won't be found;
 * a known, disclosed limitation rather than an attempt at unbounded fuzzy search.
 */
function findProjectFolder(tree: GitTreeItem[], projectsRoot: string, def: (typeof PROJECT_DEFS)[number]): string | null {
  if (hasDirectoryAt(tree, `${projectsRoot}/${def.folder}`)) return def.folder;

  const prefix = `${projectsRoot}/`;
  const directChildren = new Set<string>();
  for (const item of tree) {
    if (item.type !== "tree" || !item.path.startsWith(prefix)) continue;
    const rest = item.path.slice(prefix.length);
    const firstSegment = rest.split("/")[0];
    if (firstSegment) directChildren.add(firstSegment);
  }

  for (const child of directChildren) {
    if (def.aliases.some((pattern) => pattern.test(child))) return child;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Gather each project's files independently, plus the root README. No hard
// structural gate here — a genuinely missing/unmatched project is graded as
// absent (near-zero for that project specifically) rather than failing the
// whole submission; see the system prompt below for the scoring philosophy.
// ---------------------------------------------------------------------------

interface ProjectMaterials {
  key: ProjectKey;
  folder: string;
  resolvedFolder: string | null;
  label: string;
  maxScore: number;
  nominalFileBaseline: number;
  files: GatheredFiles;
}

export async function gatherClass02Materials(params: {
  owner: string;
  repo: string;
  tree: GitTreeItem[];
  myWorkPath: string;
}): Promise<{ readme: string; projects: ProjectMaterials[] }> {
  const { owner, repo, tree, myWorkPath } = params;
  const classRoot = `${myWorkPath}/${CLASS_02_SLUG}`;
  const projectsRoot = `${classRoot}/${AGY2_PROJECTS_DIR}`;

  const readmeEntry = tree.find((item) => item.type === "blob" && item.path.toLowerCase() === `${classRoot}/README.md`.toLowerCase());
  const readme = readmeEntry ? truncateFile(await readFileContent(owner, repo, readmeEntry.sha)).content : "";

  const projects = await Promise.all(
    PROJECT_DEFS.map(async (def) => {
      const resolvedFolder = findProjectFolder(tree, projectsRoot, def);
      const files = resolvedFolder
        ? await gatherFilesUnderPrefix({
            owner,
            repo,
            tree,
            pathPrefix: `${projectsRoot}/${resolvedFolder}/`,
            budgetChars: MAX_CONTEXT_CHARS_PER_PROJECT,
          })
        : { present: false, hasReadme: false, filesIncluded: [], filesOmitted: [], totalCharsUsed: 0 };
      return { ...def, resolvedFolder, files };
    }),
  );

  return { readme, projects };
}

// ---------------------------------------------------------------------------
// Evidence extraction (heuristic regex/string inspection, NOT an AST parse
// and NOT execution — grounds the LLM in facts instead of a raw file dump it
// has to infer everything from)
// ---------------------------------------------------------------------------

function extractConferenceEvidence(files: GatheredFiles) {
  const included = files.filesIncluded;
  const pySource = included
    .filter((f) => f.path.endsWith(".py"))
    .map((f) => f.content)
    .join("\n");
  const routeMatches = [...pySource.matchAll(/@app\.(?:route|get|post|put|delete)\(\s*["']([^"']+)["']/g)];

  return {
    filesFound: included.length,
    hasAppPy: included.some((f) => /(^|\/)(app|main|server)\.py$/i.test(f.path)),
    flaskImportFound: /from\s+flask\s+import|import\s+flask/i.test(pySource),
    routes: [...new Set(routeMatches.map((m) => m[1]))],
    templateFiles: included.filter((f) => /\/templates\//i.test(f.path) || f.path.endsWith(".html")).length,
    cssFiles: included.filter((f) => f.path.endsWith(".css")).length,
    jsFiles: included.filter((f) => f.path.endsWith(".js")).length,
    hasForm: included.some((f) => f.path.endsWith(".html") && /<form/i.test(f.content)),
    hasReadme: files.hasReadme,
  };
}

function extractPomodoroEvidence(files: GatheredFiles) {
  const included = files.filesIncluded;
  const pkgFile = included.find((f) => /(^|\/)package\.json$/i.test(f.path));

  let dependencies: string[] = [];
  let packageJsonParsed = false;
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      dependencies = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
      packageJsonParsed = true;
    } catch {
      packageJsonParsed = false;
    }
  }

  const framework = dependencies.includes("react")
    ? "react"
    : dependencies.includes("vue")
      ? "vue"
      : dependencies.includes("svelte")
        ? "svelte"
        : dependencies.includes("vite")
          ? "vite"
          : dependencies.length > 0
            ? "other"
            : null;

  return {
    filesFound: included.length,
    packageJsonParsed,
    dependencies,
    framework,
    typescript: dependencies.includes("typescript") || included.some((f) => /\.tsx?$/.test(f.path)),
    hasSrcDir: included.some((f) => /(^|\/)src\//i.test(f.path)),
    hasIndexHtml: included.some((f) => /(^|\/)index\.html$/i.test(f.path)),
  };
}

function extractMockStubsEvidence(files: GatheredFiles) {
  const included = files.filesIncluded;
  const testFile = included.find((f) => /(^|\/)test_.*\.py$/i.test(f.path) || /_test\.py$/i.test(f.path));
  const implementationFile = included.find((f) => f.path.endsWith(".py") && f !== testFile);

  const functionCount = implementationFile ? (implementationFile.content.match(/^def\s+\w+/gm) ?? []).length : 0;
  const testFunctionCount = testFile ? (testFile.content.match(/^def\s+test_\w+/gm) ?? []).length : 0;
  const assertionCount = testFile ? (testFile.content.match(/\bassert\b/g) ?? []).length : 0;

  let testImportsImplementation = false;
  if (testFile && implementationFile) {
    const implModule = implementationFile.path.split("/").pop()!.replace(/\.py$/, "");
    testImportsImplementation = new RegExp(`import\\s+${implModule}\\b|from\\s+${implModule}\\s+import`, "i").test(testFile.content);
  }

  return {
    filesFound: included.length,
    implementationFile: implementationFile?.path ?? null,
    testFile: testFile?.path ?? null,
    functionCount,
    testFunctionCount,
    assertionCount,
    testImportsImplementation,
  };
}

function extractNewsEvidence(files: GatheredFiles) {
  const included = files.filesIncluded;
  const summaryFile = included.find((f) => /summary|news/i.test(f.path) && /\.(txt|md)$/i.test(f.path));
  const content = summaryFile?.content ?? "";
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  return {
    filesFound: included.length,
    summaryFile: summaryFile?.path ?? null,
    wordCount,
    paragraphCount: content.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length,
    headlineCount: (content.match(/^#{1,3}\s+.+$/gm) ?? []).length,
  };
}

function extractEvidence(key: ProjectKey, files: GatheredFiles): Record<string, unknown> {
  switch (key) {
    case "conferenceWebsite":
      return extractConferenceEvidence(files);
    case "pomodoroTimer":
      return extractPomodoroEvidence(files);
    case "mockStubs":
      return extractMockStubsEvidence(files);
    case "newsHighlights":
      return extractNewsEvidence(files);
  }
}

const README_SECTION_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Student Information", pattern: /student/i },
  { label: "Projects Completed", pattern: /project/i },
  { label: "Prompts Used", pattern: /prompt/i },
  { label: "Lessons Learned", pattern: /lesson/i },
  { label: "Challenges", pattern: /challenge/i },
];

/** Checks which expected README sections are present by heading keyword, not exact phrase — tolerant of "About the Student", "My Challenges", etc. */
function extractReadmeSections(readmeContent: string): string[] {
  const headings = [...readmeContent.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1].trim());
  return README_SECTION_PATTERNS.filter(({ pattern }) => headings.some((h) => pattern.test(h))).map(({ label }) => label);
}

// ---------------------------------------------------------------------------
// Prompt + LLM evaluation
// ---------------------------------------------------------------------------

const CLASS_02_SYSTEM_PROMPT = `You are an experienced, fair, and detail-oriented programming instructor grading a Class 2 "Building with Google Antigravity" submission for the Agent Engineering course.

The codelab defines the MINIMUM required work: a news-highlights research summary, a conference-website Flask app, mock-stubs with unit tests, and a pomodoro-timer frontend app. Students are encouraged to extend what the codelab generates.

Do NOT reduce a score because a student added extra folders, extra features, a nicer UI, more tests, authentication, a database, or an alternative implementation of a requirement. Judge whether the minimum objective for each project is met, then award bonus credit separately for meaningful extensions. Never penalize a student for going beyond the tutorial.

Grading is per-project, not all-or-nothing: if a project is genuinely missing or its files couldn't be located, score that project at or near 0 with feedback explaining what's missing — but still grade every other project normally on its own merits. A student who completed three of the four projects well should score well on those three, not receive a blanket failure for the fourth being absent.

You are given deterministic evidence extracted from each project's files (routes found, test counts, dependencies, etc.) alongside the files themselves. Trust the evidence over your own read of a large file dump when they seem to disagree, since the evidence was computed exactly rather than skimmed.

Score each project on its own point scale (given per project below). Always respond with the requested structured JSON only.`;

function formatFiles(files: GatheredFiles): string {
  if (files.filesIncluded.length === 0) return "_No reviewable files found in this project._";
  return files.filesIncluded
    .map((f) => `#### ${f.path}${f.truncated ? " _(truncated)_" : ""}\n\`\`\`\n${f.content}\n\`\`\``)
    .join("\n\n");
}

function buildClass02Prompt(params: {
  assignment: AssignmentConfig;
  readme: string;
  readmeSections: string[];
  projects: Array<ProjectMaterials & { evidence: Record<string, unknown> }>;
}): string {
  const { assignment, readme, readmeSections, projects } = params;

  const missingReadmeSections = README_SECTION_PATTERNS.map((s) => s.label).filter((label) => !readmeSections.includes(label));

  const projectSections = projects
    .map((p) => {
      if (!p.resolvedFolder) {
        return `## ${p.label} (${p.maxScore} points)

**No matching folder was found under my-work/${CLASS_02_SLUG}/${AGY2_PROJECTS_DIR}/** (looked for "${p.folder}" and common variants). Score this project at or near 0 and say so in its feedback — but this does not affect the other projects.`;
      }

      const beyondMinimum =
        p.files.filesIncluded.length > p.nominalFileBaseline
          ? ` (baseline expectation is roughly ${p.nominalFileBaseline} files — this project has more, which may reflect meaningful extension work)`
          : "";
      const folderNote = p.resolvedFolder !== p.folder ? ` (found as "${p.resolvedFolder}", not the canonical "${p.folder}" — this is just a naming difference, not a deduction)` : "";

      return `## ${p.label} (${p.maxScore} points) — my-work/${CLASS_02_SLUG}/${AGY2_PROJECTS_DIR}/${p.resolvedFolder}/${folderNote}

### Deterministic Evidence${beyondMinimum}
\`\`\`json
${JSON.stringify(p.evidence, null, 2)}
\`\`\`

### Files
${formatFiles(p.files)}`;
    })
    .join("\n\n---\n\n");

  return `# Assignment: ${assignment.title}

## Objective
${assignment.objective}

## Expected Deliverables
${assignment.expectedDeliverables.map((d) => `- ${d}`).join("\n")}

## Student README (my-work/${CLASS_02_SLUG}/README.md)
Expected sections found by heading scan: ${readmeSections.length > 0 ? readmeSections.join(", ") : "none detected"}.
${missingReadmeSections.length > 0 ? `Sections not detected: ${missingReadmeSections.join(", ")} — a missing heading doesn't necessarily mean the content is absent, check the text itself too.` : ""}

\`\`\`
${readme || "(no README content found)"}
\`\`\`

---

${projectSections}

---

## Task
Evaluate all four projects and the README independently — a missing project only zeroes that project's own score, never the others. For each project, give a score out of its point total and specific feedback. Identify any bonus-worthy extensions across the whole submission (0-10 points total, list which features earned it). Give an overall pass/fail judgment, a short summary, and top-level strengths/improvements that span the whole submission (not tied to one project).`;
}

/** Attaches each project's fixed maxScore and computes overallScore server-side — never trust an LLM's own arithmetic or its restatement of a constant. */
function enrichResult(evaluation: MultiProjectEvaluation): MultiProjectResult {
  const newsHighlights = { ...evaluation.newsHighlights, maxScore: PROJECT_DEFS[0].maxScore };
  const conferenceWebsite = { ...evaluation.conferenceWebsite, maxScore: PROJECT_DEFS[1].maxScore };
  const mockStubs = { ...evaluation.mockStubs, maxScore: PROJECT_DEFS[2].maxScore };
  const pomodoroTimer = { ...evaluation.pomodoroTimer, maxScore: PROJECT_DEFS[3].maxScore };
  const readme = { ...evaluation.readme, maxScore: README_MAX_SCORE };

  const overallScore =
    newsHighlights.score + conferenceWebsite.score + mockStubs.score + pomodoroTimer.score + readme.score + evaluation.bonus.score;

  return {
    newsHighlights,
    conferenceWebsite,
    mockStubs,
    pomodoroTimer,
    readme,
    bonus: evaluation.bonus,
    overallScore,
    pass: evaluation.pass,
    summary: evaluation.summary,
    strengths: evaluation.strengths,
    improvements: evaluation.improvements,
  };
}

export async function evaluateClass02Assignment(params: {
  assignment: AssignmentConfig;
  owner: string;
  repo: string;
  tree: GitTreeItem[];
  myWorkPath: string;
}): Promise<MultiProjectEvaluationResult> {
  const { assignment, owner, repo, tree, myWorkPath } = params;
  const classId = CLASS_02_SLUG;

  const { readme, projects } = await gatherClass02Materials({ owner, repo, tree, myWorkPath });
  const readmeSections = extractReadmeSections(readme);
  const projectsWithEvidence = projects.map((p) => ({ ...p, evidence: extractEvidence(p.key, p.files) }));

  const prompt = buildClass02Prompt({ assignment, readme, readmeSections, projects: projectsWithEvidence });

  const result = await generateObjectWithRetry({
    schema: multiProjectEvaluationSchema,
    system: CLASS_02_SYSTEM_PROMPT,
    initialPrompt: prompt,
    buildRetryPrompt,
  });

  if (result.status === "error") {
    return { status: "error", classId, message: result.message };
  }

  return {
    status: "success",
    classId,
    data: enrichResult(result.data),
    evaluatedAt: new Date().toISOString(),
    modelUsed: MODEL_NAME,
  };
}

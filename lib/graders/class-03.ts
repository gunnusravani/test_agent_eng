import { MODEL_NAME, generateObjectWithRetry } from "@/lib/evaluator";
import { buildRetryPrompt } from "@/lib/prompts";
import { gatherFilesUnderPrefix, truncateFile, type GatheredFiles } from "@/lib/parser";
import { readFileContent, type GitTreeItem } from "@/lib/github";
import { class03EvaluationSchema, type Class03Evaluation, type Class03EvaluationResult, type Class03Result } from "@/types/schemas";
import type { AssignmentConfig, GatheredFile } from "@/types";

export const CLASS_03_SLUG = "class-03";
const SRC_DIR = "src/widgetware_sdr";
const MAX_CONTEXT_CHARS = Number(process.env.MAX_CONTEXT_CHARS_PER_CLASS03 ?? 40000);

export function isClass03(classSlug: string): boolean {
  return classSlug === CLASS_03_SLUG;
}

const CONFIG_MAX_SCORE = 20;
const INSTRUCTIONS_MAX_SCORE = 20;
const CONTEXT_BUILDER_MAX_SCORE = 25;
const TEST_SCENARIOS_MAX_SCORE = 25;
const SCOPE_DISCIPLINE_MAX_SCORE = 10;

// The four context layers the codelab expects instructions.py + context_builder.py
// to keep separate but still assemble together (slide 5 + slide 9).
const REQUIRED_CONTEXT_LAYERS = [
  { key: "instructions", label: "Instructions", pattern: /instructions?/i },
  { key: "product", label: "Product context", pattern: /product/i },
  { key: "icp", label: "ICP", pattern: /\bicp\b|ideal.{0,15}customer/i },
  { key: "policies", label: "Policies", pattern: /polic(?:y|ies)/i },
  { key: "account", label: "Account data", pattern: /account/i },
  { key: "evidence", label: "Evidence", pattern: /evidence/i },
  { key: "state", label: "Workflow state", pattern: /\bstate\b/i },
] as const;

// The four required test scenarios (slide 10).
const REQUIRED_SCENARIOS = [
  { key: "qualified", label: "Qualified account", pattern: /(?<!un)qualified/i },
  { key: "unqualified", label: "Unqualified account", pattern: /unqualified|not[\s_-]?qualified/i },
  { key: "insufficientEvidence", label: "Insufficient evidence", pattern: /insufficient[\s_-]?evidence|missing[\s_-]?evidence/i },
  { key: "promptInjection", label: "Prompt injection attempt", pattern: /prompt[\s_-]?injection/i },
] as const;

// Signals the codelab explicitly says should NOT be present yet (slide 3 + Definition of Done,
// slide 11) — an agent that has jumped ahead to build the ADK agent or wire up real external
// actions is not "done" for Class 3, no matter how good the context package itself is.
const ADK_AGENT_SIGNALS = /from\s+google\.adk|import\s+adk\b|google-adk|\bLlmAgent\b|\bAdkApp\b/i;
const GEMINI_CALL_SIGNALS = /google\.generativeai|genai\.GenerativeModel|genai\.Client\(|gemini-[\w.-]+/i;
const EXTERNAL_ACTION_SIGNALS =
  /smtplib|sendgrid|import\s+requests\b|requests\.(get|post)\(|salesforce|hubspot|simple_salesforce|googlesearch|selenium|playwright/i;

interface MaterialsBySection {
  config: GatheredFile[];
  docs: GatheredFile[];
  instructionsFile: GatheredFile | null;
  contextBuilderFile: GatheredFile | null;
  otherSrc: GatheredFile[];
  tests: GatheredFile[];
  other: GatheredFile[];
  all: GatheredFile[];
}

function bucketFiles(files: GatheredFiles, classRoot: string): MaterialsBySection {
  const rel = (path: string) => path.slice(classRoot.length + 1);
  const config: GatheredFile[] = [];
  const docs: GatheredFile[] = [];
  const tests: GatheredFile[] = [];
  const otherSrc: GatheredFile[] = [];
  const other: GatheredFile[] = [];
  let instructionsFile: GatheredFile | null = null;
  let contextBuilderFile: GatheredFile | null = null;

  for (const file of files.filesIncluded) {
    const r = rel(file.path).toLowerCase();
    if (r.startsWith("config/")) config.push(file);
    else if (r.startsWith("docs/")) docs.push(file);
    else if (r.startsWith("tests/") || /(^|\/)test_.*\.py$/.test(r) || /_test\.py$/.test(r)) tests.push(file);
    else if (r === `${SRC_DIR}/instructions.py`) instructionsFile = file;
    else if (r === `${SRC_DIR}/context_builder.py`) contextBuilderFile = file;
    else if (r.startsWith(`${SRC_DIR}/`)) otherSrc.push(file);
    else other.push(file);
  }

  return { config, docs, instructionsFile, contextBuilderFile, otherSrc, tests, other, all: files.filesIncluded };
}

export async function gatherClass03Materials(params: {
  owner: string;
  repo: string;
  tree: GitTreeItem[];
  myWorkPath: string;
}): Promise<{ readme: string; materials: MaterialsBySection }> {
  const { owner, repo, tree, myWorkPath } = params;
  const classRoot = `${myWorkPath}/${CLASS_03_SLUG}`;

  const readmeEntry = tree.find((item) => item.type === "blob" && item.path.toLowerCase() === `${classRoot}/README.md`.toLowerCase());
  const readme = readmeEntry ? truncateFile(await readFileContent(owner, repo, readmeEntry.sha)).content : "";

  const files = await gatherFilesUnderPrefix({
    owner,
    repo,
    tree,
    pathPrefix: `${classRoot}/`,
    budgetChars: MAX_CONTEXT_CHARS,
  });

  return { readme, materials: bucketFiles(files, classRoot) };
}

// ---------------------------------------------------------------------------
// Evidence extraction (heuristic regex/string inspection, NOT a YAML/AST parse
// and NOT execution — grounds the LLM in facts instead of a raw file dump it
// has to infer everything from)
// ---------------------------------------------------------------------------

const CONFIG_FILE_DEFS = [
  { key: "products", filename: "products.yaml" },
  { key: "icp", filename: "icp.yaml" },
  { key: "policies", filename: "policies.yaml" },
] as const;

function extractConfigEvidence(config: GatheredFile[]) {
  return CONFIG_FILE_DEFS.map((def) => {
    const file = config.find((f) => f.path.toLowerCase().endsWith(`/${def.filename}`));
    const topLevelKeys = file ? [...new Set([...file.content.matchAll(/^([a-zA-Z_][\w-]*)\s*:/gm)].map((m) => m[1]))] : [];
    return {
      file: def.filename,
      present: Boolean(file),
      topLevelKeyCount: topLevelKeys.length,
      topLevelKeys,
      nonTrivial: (file?.content.trim().length ?? 0) > 40,
    };
  });
}

function extractInstructionsEvidence(instructionsFile: GatheredFile | null) {
  const content = instructionsFile?.content ?? "";
  return {
    present: Boolean(instructionsFile),
    lineCount: content ? content.split("\n").length : 0,
    definesRole: /\brole\b|you are\b|act as\b/i.test(content),
    definesEvidenceRules: /evidence/i.test(content),
    definesSafetyBoundaries: /safety|boundary|boundaries|must not|never\s/i.test(content),
    definesEscalation: /escalat/i.test(content),
  };
}

function extractContextBuilderEvidence(contextBuilderFile: GatheredFile | null) {
  const content = contextBuilderFile?.content ?? "";
  const functionCount = content ? (content.match(/^def\s+\w+/gm) ?? []).length : 0;
  const layersReferenced = REQUIRED_CONTEXT_LAYERS.filter((layer) => layer.pattern.test(content)).map((layer) => layer.label);
  return {
    present: Boolean(contextBuilderFile),
    lineCount: content ? content.split("\n").length : 0,
    functionCount,
    layersReferenced,
    layersMissing: REQUIRED_CONTEXT_LAYERS.map((l) => l.label).filter((l) => !layersReferenced.includes(l)),
  };
}

function extractTestScenarioEvidence(tests: GatheredFile[]) {
  const combined = tests.map((f) => f.content).join("\n");
  const testFunctionCount = (combined.match(/^\s*(?:async\s+)?def\s+test_\w+/gm) ?? []).length;
  const assertionCount = (combined.match(/\bassert\b/g) ?? []).length;
  const scenarios = REQUIRED_SCENARIOS.map((scenario) => ({
    scenario: scenario.label,
    covered: scenario.pattern.test(combined),
  }));
  return {
    testFileCount: tests.length,
    testFiles: tests.map((f) => f.path),
    testFunctionCount,
    assertionCount,
    scenarios,
    scenariosCovered: scenarios.filter((s) => s.covered).length,
  };
}

function extractScopeDisciplineEvidence(materials: MaterialsBySection) {
  const combined = materials.all.map((f) => f.content).join("\n");
  return {
    adkAgentSignalFound: ADK_AGENT_SIGNALS.test(combined),
    geminiCallSignalFound: GEMINI_CALL_SIGNALS.test(combined),
    externalActionSignalFound: EXTERNAL_ACTION_SIGNALS.test(combined),
  };
}

// ---------------------------------------------------------------------------
// Prompt + LLM evaluation
// ---------------------------------------------------------------------------

const CLASS_03_SYSTEM_PROMPT = `You are an experienced, fair, and detail-oriented programming instructor grading a Class 3 "Build the WidgetWare SDR Context Package" submission for the Agent Engineering course.

This class is explicitly about building CONTEXT, not an agent. The codelab's stated Definition of Done is: context files exist, context layers are kept separate (not smashed into one blob), tests for four required scenarios exist and pass, no ADK agent exists yet, and no external action (real email, CRM, web search, deployment) exists yet. A student who has NOT built the agent yet and has NOT wired up any external calls is doing exactly what was asked — that is success, not incompleteness. Do NOT reward students for jumping ahead and building the agent or external integrations early; that violates the assignment's explicit scope, and you should say so in scopeDiscipline feedback and reduce that score if there's clear evidence of it (see the scopeDiscipline evidence below).

The five components you score, each on its own point scale:
- configFiles (20 pts): config/products.yaml, config/icp.yaml, config/policies.yaml — stable business rules (product info, ideal customer profile, SDR policies).
- instructions (20 pts): src/widgetware_sdr/instructions.py — defines the agent's role, evidence rules, safety boundaries, and escalation behavior.
- contextBuilder (25 pts): src/widgetware_sdr/context_builder.py — assembles instructions, product context, ICP, policies, account data, evidence, and workflow state into one context package, while keeping those layers logically separate rather than concatenating everything into an undifferentiated string.
- testScenarios (25 pts): tests covering the four required scenarios — qualified account, unqualified account, insufficient evidence, and a prompt injection attempt.
- scopeDiscipline (10 pts): did the student stay in scope (no ADK agent, no real external actions) per the Definition of Done? Full credit for staying in scope; reduce it if the deterministic evidence shows agent or external-action code.

Do NOT reduce scores because a student organized files slightly differently, added extra docs, wrote more tests than required, or used different (but reasonable) YAML key names — judge whether the substance of each component is present and sound. Score each component independently: a genuinely missing piece (e.g. no context_builder.py at all) scores that component at or near 0 with feedback explaining what's missing, but does not zero out the other components.

You are given deterministic evidence extracted from the files (which config keys exist, which context layers are referenced, which test scenarios are covered, whether agent/external-action code was found) alongside the files themselves. Trust the evidence over your own read of a large file dump when they seem to disagree, since the evidence was computed exactly rather than skimmed.

Award 0-10 bonus points total for meaningful extensions (e.g. a well-organized docs/ folder, extra edge-case scenarios, thoughtful policy design) and list which features earned it. Always respond with the requested structured JSON only.`;

function formatFiles(files: GatheredFile[]): string {
  if (files.length === 0) return "_No files found._";
  return files.map((f) => `#### ${f.path}${f.truncated ? " _(truncated)_" : ""}\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n");
}

function buildClass03Prompt(params: {
  assignment: AssignmentConfig;
  readme: string;
  materials: MaterialsBySection;
}): string {
  const { assignment, readme, materials } = params;

  const configEvidence = extractConfigEvidence(materials.config);
  const instructionsEvidence = extractInstructionsEvidence(materials.instructionsFile);
  const contextBuilderEvidence = extractContextBuilderEvidence(materials.contextBuilderFile);
  const testEvidence = extractTestScenarioEvidence(materials.tests);
  const scopeEvidence = extractScopeDisciplineEvidence(materials);

  return `# Assignment: ${assignment.title}

## Objective
${assignment.objective}

## Expected Deliverables
${assignment.expectedDeliverables.map((d) => `- ${d}`).join("\n")}

## Student README (my-work/${CLASS_03_SLUG}/README.md)
\`\`\`
${readme || "(no README content found)"}
\`\`\`

---

## Component 1: Config Files (${CONFIG_MAX_SCORE} points) — config/

### Deterministic Evidence
\`\`\`json
${JSON.stringify(configEvidence, null, 2)}
\`\`\`

### Files
${formatFiles(materials.config)}

---

## Component 2: Agent Instructions (${INSTRUCTIONS_MAX_SCORE} points) — src/widgetware_sdr/instructions.py

### Deterministic Evidence
\`\`\`json
${JSON.stringify(instructionsEvidence, null, 2)}
\`\`\`

### Files
${formatFiles(materials.instructionsFile ? [materials.instructionsFile] : [])}

---

## Component 3: Context Builder (${CONTEXT_BUILDER_MAX_SCORE} points) — src/widgetware_sdr/context_builder.py

### Deterministic Evidence
\`\`\`json
${JSON.stringify(contextBuilderEvidence, null, 2)}
\`\`\`

### Files
${formatFiles(materials.contextBuilderFile ? [materials.contextBuilderFile] : [])}

${materials.otherSrc.length > 0 ? `### Other files under src/widgetware_sdr/\n${formatFiles(materials.otherSrc)}` : ""}

---

## Component 4: Test Scenarios (${TEST_SCENARIOS_MAX_SCORE} points) — tests/, covering qualified account, unqualified account, insufficient evidence, and prompt injection attempt

### Deterministic Evidence
\`\`\`json
${JSON.stringify(testEvidence, null, 2)}
\`\`\`

### Files
${formatFiles(materials.tests)}

---

## Component 5: Scope Discipline (${SCOPE_DISCIPLINE_MAX_SCORE} points) — Definition of Done: no ADK agent yet, no external action yet

### Deterministic Evidence (scanned across all files in my-work/${CLASS_03_SLUG}/)
\`\`\`json
${JSON.stringify(scopeEvidence, null, 2)}
\`\`\`

${materials.docs.length > 0 ? `---\n\n## docs/\n${formatFiles(materials.docs)}` : ""}

${materials.other.length > 0 ? `---\n\n## Other files\n${formatFiles(materials.other)}` : ""}

---

## Task
Evaluate all five components independently — a missing or weak component only affects its own score, never the others. For each component, give a score out of its point total and specific feedback. Identify any bonus-worthy extensions (0-10 points total, list which features earned it). Give an overall pass/fail judgment, a short summary, and top-level strengths/improvements that span the whole submission (not tied to one component).`;
}

/** Attaches each component's fixed maxScore and computes overallScore server-side — never trust an LLM's own arithmetic or its restatement of a constant. */
function enrichResult(evaluation: Class03Evaluation): Class03Result {
  const configFiles = { ...evaluation.configFiles, maxScore: CONFIG_MAX_SCORE };
  const instructions = { ...evaluation.instructions, maxScore: INSTRUCTIONS_MAX_SCORE };
  const contextBuilder = { ...evaluation.contextBuilder, maxScore: CONTEXT_BUILDER_MAX_SCORE };
  const testScenarios = { ...evaluation.testScenarios, maxScore: TEST_SCENARIOS_MAX_SCORE };
  const scopeDiscipline = { ...evaluation.scopeDiscipline, maxScore: SCOPE_DISCIPLINE_MAX_SCORE };

  const overallScore =
    configFiles.score + instructions.score + contextBuilder.score + testScenarios.score + scopeDiscipline.score + evaluation.bonus.score;

  return {
    configFiles,
    instructions,
    contextBuilder,
    testScenarios,
    scopeDiscipline,
    bonus: evaluation.bonus,
    overallScore,
    pass: evaluation.pass,
    summary: evaluation.summary,
    strengths: evaluation.strengths,
    improvements: evaluation.improvements,
  };
}

export async function evaluateClass03Assignment(params: {
  assignment: AssignmentConfig;
  owner: string;
  repo: string;
  tree: GitTreeItem[];
  myWorkPath: string;
}): Promise<Class03EvaluationResult> {
  const { assignment, owner, repo, tree, myWorkPath } = params;
  const classId = CLASS_03_SLUG;

  const { readme, materials } = await gatherClass03Materials({ owner, repo, tree, myWorkPath });
  const prompt = buildClass03Prompt({ assignment, readme, materials });

  const result = await generateObjectWithRetry({
    schema: class03EvaluationSchema,
    system: CLASS_03_SYSTEM_PROMPT,
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

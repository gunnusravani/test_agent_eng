import { MODEL_NAME, generateObjectWithRetry } from "@/lib/evaluator";
import { buildRetryPrompt } from "@/lib/prompts";
import { readFileContent, type GitTreeItem } from "@/lib/github";
import { class02aEvaluationSchema, type Class02aEvaluation, type Class02aEvaluationResult, type Class02aResult } from "@/types/schemas";
import type { AssignmentConfig, GatheredFile } from "@/types";

// This grader is written directly against the instructor's own class-02A/grader.py,
// ASSIGNMENT.md, and CASES.md (pasted into the repo as grading ground truth, gitignored —
// see .gitignore) rather than paraphrased from the class slides. Unlike an earlier version,
// which ran the student's own pytest suite in a subprocess sandbox, this doesn't work on
// Vercel's standard Node serverless functions (no git/python shipped there), so the mechanical
// facts that used to come from running pytest are now extracted as static evidence and handed
// to an LLM for judgment — same hybrid pattern as class-02/class-03. The one component with no
// ambiguity at all (starterIntegrity — pure file-existence/string facts) stays fully
// server-computed instead of being asked of the LLM, same principle as maxScore/overallScore
// never being LLM-authored.

export const CLASS_02A_SLUG = "class-02a";
const MODEL_USED = MODEL_NAME;

export function isClass02a(classSlug: string): boolean {
  return classSlug === CLASS_02A_SLUG;
}

const L1_METADATA_MAX_SCORE = 15;
const L2_INSTRUCTIONS_MAX_SCORE = 25;
const CASE_TRACES_MAX_SCORE = 30;
const REFLECTION_MAX_SCORE = 15;
const STARTER_INTEGRITY_MAX_SCORE = 15;

const REQUIRED_L3_PATHS = [
  "references/discount-policy.md",
  "references/renewal-process.md",
  "references/risk-escalation.md",
  "assets/renewal-brief-template.md",
  "scripts/calculate_quote.py",
] as const;

const REQUIRED_L1_TERMS = ["discount", "timing", "risk", "quote", "brief"] as const;

// Mirrors class-02A/tests/test_starter_integrity.py's test_env_example_has_one_clear_model_setting_and_both_auth_paths.
const REQUIRED_ENV_EXAMPLE_LINES = [
  "GEMINI_MODEL=gemini-3.7-flash",
  "GEMINI_API_KEY=",
  "GOOGLE_CLOUD_PROJECT=",
  "GOOGLE_CLOUD_LOCATION=",
  "GOOGLE_GENAI_USE_VERTEXAI",
] as const;

// Ground truth from the instructor's CASES.md — embedded verbatim in the prompt so the LLM can
// check whether a student's submission.md trace evidence is actually correct, not just present.
const CASE_EXPECTATIONS = [
  {
    letter: "A",
    prompt: "A customer with $92,000 ARR is requesting a 12% renewal discount. What approval route applies?",
    expectedL3: ["references/discount-policy.md"],
    notes: "The calculator is NOT required unless the student also calculates dollar discount/net ARR.",
  },
  {
    letter: "B",
    prompt: "A customer's renewal is 75 days away. What should the CSM be doing now?",
    expectedL3: ["references/renewal-process.md"],
    notes: "",
  },
  {
    letter: "C",
    prompt:
      "The customer is regulated, marked high churn risk, renews in 10 days, wants an 18% discount, and wants auto-renewal removed. What should we do?",
    expectedL3: ["references/discount-policy.md", "references/renewal-process.md", "references/risk-escalation.md"],
    notes: "Cross-resource case — all three references are genuinely required, this is not over-loading.",
  },
  {
    letter: "D",
    prompt:
      "Create an approval-ready renewal brief for Apex Manufacturing. ARR is $150,000. They request a 15% discount and renew in 42 days. We do not yet know the executive sponsor.",
    expectedL3: ["assets/renewal-brief-template.md", "references/discount-policy.md", "references/renewal-process.md"],
    notes: "Missing fields (executive sponsor) must remain missing or be marked for follow-up — never invented.",
  },
  {
    letter: "E",
    prompt: "For a $92,000 ARR renewal with a 12% requested discount, calculate the discount amount and net ARR, then tell me the approval route.",
    expectedL3: ["scripts/calculate_quote.py", "references/discount-policy.md"],
    notes: "Expected math: discount amount = $11,040, net ARR = $80,960. This must come from the deterministic script, not be hand-estimated.",
  },
  {
    letter: "F",
    prompt: "Can we promise this customer that WidgetWare satisfies every SOC 2 control they asked about? Give me the assurance language to send.",
    expectedL3: ["references/risk-escalation.md"],
    notes:
      'Correct answer must NOT invent assurance/SOC2 coverage language, must state the supplied sources do not establish the claim, and must escalate to Legal/Reliability. Grounded refusal is success, not a failure to answer.',
  },
] as const;

const REFLECTION_SUBSECTIONS = [
  "Skill vs resource",
  "L1 → L2 → L3 progressive disclosure",
  "Why minimum-resource loading matters",
  "Why deterministic math belongs in a script",
  "Why safe abstention can be a correct answer",
] as const;

/** Case-insensitive tree lookup for my-work/class-02a — the real folder is cased "class-02A" in student repos, and GitHub paths are case-sensitive on disk. Returns the actual (case-preserved) path. */
function resolveClassRoot(tree: GitTreeItem[], myWorkPath: string, slug: string): string | null {
  const target = `${myWorkPath}/${slug}`.toLowerCase();
  return tree.find((item) => item.type === "tree" && item.path.toLowerCase() === target)?.path ?? null;
}

function findBlob(tree: GitTreeItem[], path: string): GitTreeItem | undefined {
  const target = path.toLowerCase();
  return tree.find((item) => item.type === "blob" && item.path.toLowerCase() === target);
}

/** Mirrors Python's `text.split("---", 2)[1]` — frontmatter is everything between the first two "---" markers. SKILL.md's body also uses bare "---" as a section rule, so a naive split-on-every-occurrence would grab the wrong chunk. */
function extractFrontmatter(text: string): string | null {
  const first = text.indexOf("---");
  if (first === -1) return null;
  const second = text.indexOf("---", first + 3);
  if (second === -1) return null;
  return text.slice(first + 3, second);
}

function extractL1Description(skillText: string): string | null {
  const frontmatter = extractFrontmatter(skillText);
  if (frontmatter === null) return null;
  const match = frontmatter.match(/^description:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

/** Extracts a "## <heading>" section's body, bounded by the next level-1-or-2 heading (or end of text) — used for both Case A-F sections and the five "What I learned" subsections, which share this exact shape. */
function extractSection(text: string, heading: string): string | null {
  const marker = `## ${heading}`;
  const idx = text.indexOf(marker);
  if (idx === -1) return null;
  let section = text.slice(idx + marker.length);
  const nextHeadingIdx = section.search(/\n#{1,2}\s/);
  if (nextHeadingIdx !== -1) section = section.slice(0, nextHeadingIdx);
  return section.trim();
}

// ---------------------------------------------------------------------------
// Evidence extraction (heuristic regex/string inspection, NOT execution — grounds the LLM in
// facts instead of a raw file dump it has to infer everything from)
// ---------------------------------------------------------------------------

function extractL1Evidence(skillText: string | null) {
  if (skillText === null) return { present: false };
  const description = extractL1Description(skillText);
  const descriptionLower = description?.toLowerCase() ?? "";
  const termsFound = REQUIRED_L1_TERMS.filter((t) => descriptionLower.includes(t));
  const termsMissing = REQUIRED_L1_TERMS.filter((t) => !descriptionLower.includes(t));
  // §Task 2: "Do not put approval thresholds or detailed policy rules in L1" — a literal
  // percentage in the description is a cheap, imperfect signal that L3 policy detail leaked up.
  const possibleLeakedApprovalThresholds = [...(description ?? "").matchAll(/\b\d{1,3}%/g)].map((m) => m[0]);
  return {
    present: true,
    description,
    descriptionLength: description?.length ?? 0,
    discoveryTermsFound: termsFound,
    discoveryTermsMissing: termsMissing,
    hasTroubleshootingExclusion: descriptionLower.includes("troubleshoot"),
    possibleLeakedApprovalThresholds,
  };
}

function extractL2Evidence(skillText: string | null) {
  if (skillText === null) return { present: false };
  const exactPathsFound = REQUIRED_L3_PATHS.filter((p) => skillText.includes(p));
  const exactPathsMissing = REQUIRED_L3_PATHS.filter((p) => !skillText.includes(p));
  const lower = skillText.toLowerCase();
  return {
    present: true,
    noTodoMarkers: !skillText.includes("TODO"),
    exactPathsFound,
    exactPathsMissing,
    sayssLookInReferencesFolderInsteadOfExactPath: /look in the references folder/i.test(skillText),
    mentionsMinimumResourceLoading: lower.includes("minimum") && lower.includes("resource"),
    mentionsMissingInputHandling: lower.includes("missing") && lower.includes("input"),
    mentionsCitationRequirement: lower.includes("cite"),
    mentionsUnsupportedQuestionHandling: lower.includes("unsupported"),
    mentionsRequestedRoutedApprovedStates: ["requested", "routed", "approved"].every((w) => lower.includes(w)),
  };
}

function extractCaseTracesEvidence(submissionText: string | null) {
  if (submissionText === null) return { present: false, cases: [] };
  const cases = CASE_EXPECTATIONS.map(({ letter }) => {
    const text = extractSection(submissionText, `Case ${letter}`);
    return { letter, sectionPresent: text !== null, text: (text ?? "").slice(0, 1500) };
  });
  return { present: true, cases };
}

function extractReflectionEvidence(submissionText: string | null) {
  if (submissionText === null) return { present: false, subsections: [] };
  const subsections = REFLECTION_SUBSECTIONS.map((heading) => {
    const text = extractSection(submissionText, heading);
    const isPlaceholder = text === null || text === "TODO" || text.length === 0;
    return { heading, present: text !== null, isPlaceholder, text: (text ?? "").slice(0, 800) };
  });
  return { present: true, subsections };
}

/** Fully deterministic — pure file-existence/string facts have no judgment call, so this is computed server-side rather than asked of the LLM (same principle as maxScore/overallScore). */
function buildStarterIntegrityComponent(params: {
  tree: GitTreeItem[];
  skillDir: string;
  calcText: string | null;
  envExampleText: string | null;
  agentText: string | null;
  readmeText: string | null;
}): { score: number; maxScore: number; feedback: string } {
  const { tree, skillDir, calcText, envExampleText, agentText, readmeText } = params;

  const missingResources = REQUIRED_L3_PATHS.filter((p) => !findBlob(tree, `${skillDir}/${p}`));
  const calcOk =
    calcText !== null &&
    /def\s+calculate_quote\s*\(/.test(calcText) &&
    ["discount_amount", "net_arr"].every((k) => calcText.includes(k)) &&
    !/raise\s+NotImplementedError/.test(calcText) &&
    !calcText.includes("TODO");
  const envOk = envExampleText !== null && REQUIRED_ENV_EXAMPLE_LINES.every((line) => envExampleText.includes(line));
  const agentOk =
    agentText !== null &&
    (agentText.includes('os.getenv("GEMINI_MODEL"') || agentText.includes("os.getenv('GEMINI_MODEL'")) &&
    agentText.includes("gemini-3.7-flash");
  const readmeOk = readmeText !== null && readmeText.includes("adk web .") && readmeText.includes("Do **not** `cd renewal_desk_agent`");

  const subChecks = [
    { label: "L3 resource files exist on disk", passed: missingResources.length === 0 },
    { label: "calculate_quote.py is a real, non-stub calculator", passed: calcOk },
    { label: ".env.example has required model/auth settings", passed: envOk },
    { label: "agent.py reads model from environment", passed: agentOk },
    { label: "README has correct adk web launch instructions", passed: readmeOk },
  ];
  const perCheckPoints = STARTER_INTEGRITY_MAX_SCORE / subChecks.length;
  const score = subChecks.filter((c) => c.passed).length * perCheckPoints;
  const feedback = subChecks.map((c) => `${c.passed ? "✓" : "✗"} ${c.label}`).join("; ");

  return { score, maxScore: STARTER_INTEGRITY_MAX_SCORE, feedback };
}

// ---------------------------------------------------------------------------
// Prompt + LLM evaluation
// ---------------------------------------------------------------------------

const CLASS_02A_SYSTEM_PROMPT = `You are an experienced, fair, and detail-oriented programming instructor grading a Class 02A "Engineer the Renewal Advisor Skill" submission for the Agent Engineering course, against the class's own ASSIGNMENT.md and CASES.md (summarized for you below — these are the authoritative rubric, not the class slides).

Students engineer a WidgetWare "renewal-advisor" Agent Skill using progressive disclosure: L1 (frontmatter description) makes the skill discoverable, L2 (SKILL.md body) is the operating procedure, L3 (references/assets/scripts) is the actual business content loaded only when needed. The core discipline being tested is precision: exact L3 paths (not "look in the references folder"), minimum-resource loading, evidence citation, and safe grounded refusal when evidence is insufficient — never invented approval status or compliance claims.

The four components you score, each on its own point scale:
- l1Metadata (${L1_METADATA_MAX_SCORE} pts): the YAML frontmatter description must make the skill discoverable for renewal-discount routing, renewal timing/auto-renewal, churn/legal/security/regulated-customer risk, renewal quote calculations, and approval-ready briefs, plus explicitly exclude unrelated product troubleshooting. It must NOT contain approval thresholds or detailed policy rules (those belong in L3) — the evidence includes any literal percentages found in the description as a signal, but use your own reading too, since the heuristic is imperfect. Judge genuine specificity, not keyword-stuffing: a description that mechanically lists all five terms without reading as coherent, specific guidance should NOT get full credit.
- l2Instructions (${L2_INSTRUCTIONS_MAX_SCORE} pts): the SKILL.md body must tell the agent when to use/not use the skill, required inputs and what to do when one is missing, how to classify the request, the exact L3 path for each intent (never "look in the references folder" — the evidence flags this literal anti-pattern if present), the minimum-resource-loading rule, how/where to cite evidence, when to use the deterministic quote script, how to preserve requested vs. routed vs. approved status, what to do for unsupported questions, and what to do when a named resource cannot be loaded. Judge completeness and genuine specificity, not just keyword presence.
- caseTraces (${CASE_TRACES_MAX_SCORE} pts): submission.md's Case A-F trace evidence, checked against the exact expected L3 resources and (Case E) exact math given below — this is the component most students under-invest in, since it requires actually running the cases correctly, not just filling in a template. For each case, compare the student's "Observed L3" against the expected set: did they load what was needed, avoid loading what wasn't, get Case E's math right, and did Case F demonstrate a genuine grounded refusal (not inventing SOC2 coverage, correctly escalating to Legal/Reliability) rather than just answering the question? A case section that's present but shows wrong or missing resources, wrong math, or an ungrounded answer should score low on that case even though the section exists.
- reflection (${REFLECTION_MAX_SCORE} pts): the "What I learned" section's five subsections (skill vs. resource; L1→L2→L3 progressive disclosure; why minimum-resource loading matters; why deterministic math belongs in a script; why safe abstention can be a correct answer). Judge whether these read as genuine, specific understanding grounded in what the student actually built and observed, not generic restatements of the assignment prompt.

You are given deterministic evidence extracted from the files (which discovery terms/exact paths/contract keywords are present, per-case extracted text, per-reflection-subsection extracted text) alongside the files themselves. Trust the evidence over your own read of a large file dump when they seem to disagree, since the evidence was computed exactly rather than skimmed.

Watch specifically for the gaming patterns the assignment's own instructions (Task 8) warn students against: "approved" language used without actual approval evidence present, guessed or approximate filenames instead of the exact required paths, and policy or instruction text that was clearly copied or reworded only to satisfy an automated grader rather than to genuinely guide the agent. Penalize these when you see them, even if a naive keyword check would pass.

A fifth component, starterIntegrity (${STARTER_INTEGRITY_MAX_SCORE} pts — whether the required L3 files exist on disk, the calculator script is a real implementation, and the .env.example/agent.py/README scaffolding is intact), is computed separately and deterministically — you do not need to score it.

Award 0-10 bonus points for meaningful extensions beyond the minimum: unusually rigorous case tracing (e.g. explicitly noting near-miss resource loads), a reflection that honestly catches the student's own mistakes or edge cases they missed, or genuinely clear writing that would help a new teammate understand the skill. List which features earned it. Always respond with the requested structured JSON only.`;

function formatFiles(files: GatheredFile[]): string {
  if (files.length === 0) return "_No files found._";
  return files.map((f) => `#### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n");
}

function buildClass02aPrompt(params: {
  assignment: AssignmentConfig;
  skillFile: GatheredFile | null;
  submissionFile: GatheredFile | null;
}): string {
  const { assignment, skillFile, submissionFile } = params;
  const skillText = skillFile?.content ?? null;
  const submissionText = submissionFile?.content ?? null;

  const l1Evidence = extractL1Evidence(skillText);
  const l2Evidence = extractL2Evidence(skillText);
  const caseEvidence = extractCaseTracesEvidence(submissionText);
  const reflectionEvidence = extractReflectionEvidence(submissionText);

  return `# Assignment: ${assignment.title}

## Objective
${assignment.objective}

## Expected Deliverables
${assignment.expectedDeliverables.map((d) => `- ${d}`).join("\n")}

---

## Case ground truth (from the instructor's CASES.md — compare the student's Observed L3/final result against this exactly)
${CASE_EXPECTATIONS.map(
  (c) =>
    `### Case ${c.letter}\nPrompt: ${c.prompt}\nExpected L3: ${c.expectedL3.join(", ")}${c.notes ? `\nNotes: ${c.notes}` : ""}`,
).join("\n\n")}

---

## Component 1: L1 Metadata (${L1_METADATA_MAX_SCORE} points)

### Deterministic Evidence
\`\`\`json
${JSON.stringify(l1Evidence, null, 2)}
\`\`\`

## Component 2: L2 Instructions (${L2_INSTRUCTIONS_MAX_SCORE} points)

### Deterministic Evidence
\`\`\`json
${JSON.stringify(l2Evidence, null, 2)}
\`\`\`

### SKILL.md
${formatFiles(skillFile ? [skillFile] : [])}

---

## Component 3: Case Traces (${CASE_TRACES_MAX_SCORE} points)

### Deterministic Evidence (per-case extracted text from submission.md, compare against the case ground truth above)
\`\`\`json
${JSON.stringify(caseEvidence, null, 2)}
\`\`\`

---

## Component 4: Reflection (${REFLECTION_MAX_SCORE} points)

### Deterministic Evidence
\`\`\`json
${JSON.stringify(reflectionEvidence, null, 2)}
\`\`\`

---

## Task
Evaluate all four components independently — a missing or weak component only affects its own score, never the others. For each component, give a score out of its point total and specific feedback that references what was actually found (or missing) in the evidence and files above. Identify any bonus-worthy extensions (0-10 points total, list which features earned it). Give an overall pass/fail judgment, a short summary, and top-level strengths/improvements that span the whole submission (not tied to one component).`;
}

/** Attaches each component's fixed maxScore, computes the deterministic starterIntegrity component, and computes overallScore server-side — never trust an LLM's own arithmetic or its restatement of a constant. pass stays the LLM's own holistic judgment (same as class-02/class-03), not a hard score threshold. */
function enrichResult(
  evaluation: Class02aEvaluation,
  starterIntegrity: { score: number; maxScore: number; feedback: string },
): Class02aResult {
  const l1Metadata = { ...evaluation.l1Metadata, maxScore: L1_METADATA_MAX_SCORE };
  const l2Instructions = { ...evaluation.l2Instructions, maxScore: L2_INSTRUCTIONS_MAX_SCORE };
  const caseTraces = { ...evaluation.caseTraces, maxScore: CASE_TRACES_MAX_SCORE };
  const reflection = { ...evaluation.reflection, maxScore: REFLECTION_MAX_SCORE };

  const overallScore = l1Metadata.score + l2Instructions.score + caseTraces.score + reflection.score + starterIntegrity.score + evaluation.bonus.score;

  return {
    l1Metadata,
    l2Instructions,
    caseTraces,
    reflection,
    starterIntegrity,
    bonus: evaluation.bonus,
    overallScore,
    pass: evaluation.pass,
    summary: evaluation.summary,
    strengths: evaluation.strengths,
    improvements: evaluation.improvements,
  };
}

export async function evaluateClass02aAssignment(params: {
  assignment: AssignmentConfig;
  owner: string;
  repo: string;
  tree: GitTreeItem[];
  myWorkPath: string;
}): Promise<Class02aEvaluationResult> {
  const { assignment, owner, repo, tree, myWorkPath } = params;
  const classId = CLASS_02A_SLUG;

  try {
    const classRoot = resolveClassRoot(tree, myWorkPath, CLASS_02A_SLUG);
    if (!classRoot) {
      return { status: "error", classId, message: `Could not locate my-work/${CLASS_02A_SLUG} in the repository tree.` };
    }

    const skillDir = `${classRoot}/renewal_desk_agent/skills/renewal-advisor`;
    const skillPath = `${skillDir}/SKILL.md`;
    const submissionPath = `${classRoot}/submission.md`;
    const envExamplePath = `${classRoot}/renewal_desk_agent/.env.example`;
    const agentPath = `${classRoot}/renewal_desk_agent/agent.py`;
    const readmePath = `${classRoot}/README.md`;
    const calcPath = `${skillDir}/scripts/calculate_quote.py`;

    const skillBlob = findBlob(tree, skillPath);
    const submissionBlob = findBlob(tree, submissionPath);
    const envExampleBlob = findBlob(tree, envExamplePath);
    const agentBlob = findBlob(tree, agentPath);
    const readmeBlob = findBlob(tree, readmePath);
    const calcBlob = findBlob(tree, calcPath);

    const readBlob = (blob: GitTreeItem | undefined) => (blob ? readFileContent(owner, repo, blob.sha) : Promise.resolve(null));
    const [skillText, submissionText, envExampleText, agentText, readmeText, calcText] = await Promise.all([
      readBlob(skillBlob),
      readBlob(submissionBlob),
      readBlob(envExampleBlob),
      readBlob(agentBlob),
      readBlob(readmeBlob),
      readBlob(calcBlob),
    ]);

    const skillFile: GatheredFile | null = skillBlob && skillText !== null ? { path: skillPath, category: "markdown", content: skillText, truncated: false } : null;
    const submissionFile: GatheredFile | null =
      submissionBlob && submissionText !== null ? { path: submissionPath, category: "markdown", content: submissionText, truncated: false } : null;

    const prompt = buildClass02aPrompt({ assignment, skillFile, submissionFile });

    const result = await generateObjectWithRetry({
      schema: class02aEvaluationSchema,
      system: CLASS_02A_SYSTEM_PROMPT,
      initialPrompt: prompt,
      buildRetryPrompt,
    });

    if (result.status === "error") {
      return { status: "error", classId, message: result.message };
    }

    const starterIntegrity = buildStarterIntegrityComponent({ tree, skillDir, calcText, envExampleText, agentText, readmeText });

    return {
      status: "success",
      classId,
      data: enrichResult(result.data, starterIntegrity),
      evaluatedAt: new Date().toISOString(),
      modelUsed: MODEL_USED,
    };
  } catch (error) {
    return { status: "error", classId, message: error instanceof Error ? error.message : "Unknown error grading class-02a." };
  }
}

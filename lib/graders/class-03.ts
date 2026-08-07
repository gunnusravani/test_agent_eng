import { MODEL_NAME, generateObjectWithRetry } from "@/lib/evaluator";
import { buildRetryPrompt } from "@/lib/prompts";
import { gatherFilesUnderPrefix, truncateFile, type GatheredFiles } from "@/lib/parser";
import { readFileContent, type GitTreeItem } from "@/lib/github";
import { class03EvaluationSchema, type Class03Evaluation, type Class03EvaluationResult, type Class03Result } from "@/types/schemas";
import type { AssignmentConfig, GatheredFile } from "@/types";

// This grader is written directly against SPEC.md (the doc students build their
// submission against, committed at my-work/class-03/SPEC.md) — not paraphrased
// from the class slides. Section references below (§N) point back to it.

export const CLASS_03_SLUG = "class-03";
const SRC_DIR = "src/widgetware_sdr";
const MAX_CONTEXT_CHARS = Number(process.env.MAX_CONTEXT_CHARS_PER_CLASS03 ?? 40000);

export function isClass03(classSlug: string): boolean {
  return classSlug === CLASS_03_SLUG;
}

const CONFIG_MAX_SCORE = 20;
const INSTRUCTIONS_MAX_SCORE = 15;
const CONTEXT_BUILDER_MAX_SCORE = 20;
const EVIDENCE_SAFETY_MAX_SCORE = 15;
const SCENARIOS_TESTS_MAX_SCORE = 20;
const SCOPE_DISCIPLINE_MAX_SCORE = 10;

// §7: the five context layers context_builder.py must keep separate but still assemble,
// and §10: the exact dict keys build_context() is expected to return them under.
const REQUIRED_OUTPUT_LAYERS = [
  { key: "system_instructions", label: "system_instructions" },
  { key: "business_context", label: "business_context" },
  { key: "task_context", label: "task_context" },
  { key: "retrieved_evidence", label: "retrieved_evidence" },
  { key: "state", label: "state" },
] as const;

// §12: the four required scenario fixtures, identified by filename (tests/scenarios/*.yaml)
// rather than by scanning prose content — the fixture data itself (account fields, evidence
// records) won't necessarily contain the word "qualified" etc. anywhere in its body.
const REQUIRED_SCENARIO_FILES = [
  { key: "qualified", label: "Qualified account", pattern: /(?<!un)qualified/i },
  { key: "unqualified", label: "Unqualified account", pattern: /unqualified/i },
  { key: "insufficientEvidence", label: "Insufficient evidence", pattern: /insufficient/i },
  { key: "promptInjection", label: "Prompt injection", pattern: /injection/i },
] as const;

// §8.3: the five evidence classifications policies.yaml must define.
const REQUIRED_EVIDENCE_CLASSIFICATIONS = ["verified_fact", "derived_fact", "inference", "unknown", "conflict"];

// §8.2: the ICP fit dimensions/required fields.
const ICP_FIELD_PATTERNS = [
  { key: "companySize", label: "minimum company size", pattern: /minimum[_\s-]?company[_\s-]?size|min[_\s-]?company[_\s-]?size|company[_\s-]?size/i },
  { key: "preferredIndustries", label: "preferred industries", pattern: /preferred[_\s-]?industr/i },
  { key: "excludedIndustries", label: "excluded industries", pattern: /exclud(?:ed)?[_\s-]?industr/i },
  { key: "regions", label: "preferred regions", pattern: /region/i },
  { key: "buyingSignals", label: "buying signals", pattern: /buying[_\s-]?signal/i },
  { key: "requiredFields", label: "required account fields", pattern: /required[_\s-]?(?:account[_\s-]?)?fields?/i },
] as const;

// §9: the eight questions instructions.py must answer, checked heuristically by keyword.
const INSTRUCTIONS_REQUIREMENTS = [
  { key: "role", label: "defines the agent's role", pattern: /\brole\b|you are\b|act as\b/i },
  { key: "objective", label: "defines its objective", pattern: /objective|purpose|goal/i },
  { key: "allowedInformation", label: "defines what information it may use", pattern: /supplied (context|evidence)|only use|may (only )?use/i },
  { key: "evidenceClassification", label: "defines how to classify evidence", pattern: /classif|verified_fact|derived_fact|inference/i },
  { key: "uncertaintyHandling", label: "defines how to handle uncertainty", pattern: /uncertain|unknown|insufficient evidence/i },
  { key: "prohibitedActions", label: "defines prohibited actions", pattern: /prohibit|must not|never\s|do not (send|modify|invent)/i },
  { key: "stopConditions", label: "defines when it must stop", pattern: /\bstop\b|halt/i },
  { key: "escalation", label: "defines when to escalate to a human", pattern: /escalat|human approval|require.{0,15}approval/i },
] as const;

// §9: the spec's own examples of vague instructions students are told to avoid — a near-exact
// match is a strong, cheap signal that the instructions are generic filler rather than the
// "observable" behavior the spec asks for.
const VAGUE_INSTRUCTION_PATTERNS = [/always be accurate/i, /use good judgment/i, /^be safe\.?$/im];

// §5.2 + §10.1 + §17: everything Class 3 explicitly must NOT contain yet. An agent that has
// jumped ahead — built the ADK agent, called an LLM, wired up real external actions — is not
// "done" for Class 3 no matter how good the context package itself is.
const ADK_AGENT_SIGNALS = /from\s+google\.adk|import\s+adk\b|google-adk|\bLlmAgent\b|\bAdkApp\b/i;
const LLM_CALL_SIGNALS =
  /google\.generativeai|genai\.GenerativeModel|genai\.Client\(|gemini-[\w.-]+|openai\.|import\s+openai\b|anthropic\.|from\s+anthropic\b/i;
const WEB_SEARCH_SIGNALS = /googlesearch|serpapi|bing_search|duckduckgo_search|tavily/i;
const EXTERNAL_COMMS_SIGNALS = /smtplib|sendgrid|twilio|slack_sdk|webhook.{0,15}post|salesforce|hubspot|simple_salesforce/i;
const DB_PERSISTENCE_SIGNALS = /sqlalchemy|psycopg2|pymongo|import\s+sqlite3\b|boto3\.client\(\s*["']dynamodb|redis\.Redis\(/i;
const DEPLOYMENT_FILENAME_SIGNALS = /(^|\/)dockerfile$|(^|\/)docker-compose\.ya?ml$/i;
const DEPLOYMENT_CONTENT_SIGNALS = /gcloud run deploy|kubectl apply|vercel --prod/i;

interface MaterialsBySection {
  config: GatheredFile[];
  docs: GatheredFile[];
  projectFiles: GatheredFile[];
  instructionsFile: GatheredFile | null;
  contextBuilderFile: GatheredFile | null;
  otherSrc: GatheredFile[];
  testPyFiles: GatheredFile[];
  scenarioFixtureFiles: GatheredFile[];
  other: GatheredFile[];
  all: GatheredFile[];
}

function matchScenarioFile(basename: string): (typeof REQUIRED_SCENARIO_FILES)[number] | undefined {
  return REQUIRED_SCENARIO_FILES.find((s) => s.pattern.test(basename));
}

function bucketFiles(files: GatheredFiles, classRoot: string): MaterialsBySection {
  const rel = (path: string) => path.slice(classRoot.length + 1);
  const config: GatheredFile[] = [];
  const docs: GatheredFile[] = [];
  const projectFiles: GatheredFile[] = [];
  const otherSrc: GatheredFile[] = [];
  const testPyFiles: GatheredFile[] = [];
  const scenarioFixtureFiles: GatheredFile[] = [];
  const other: GatheredFile[] = [];
  let instructionsFile: GatheredFile | null = null;
  let contextBuilderFile: GatheredFile | null = null;

  for (const file of files.filesIncluded) {
    const r = rel(file.path).toLowerCase();
    const basename = r.split("/").pop() ?? "";

    // Scenario fixtures are checked by filename first (and can live anywhere under the
    // submission), since their content is structured account/evidence data that won't
    // necessarily contain the scenario's name anywhere in its body.
    if ((r.endsWith(".yaml") || r.endsWith(".yml") || r.endsWith(".json")) && matchScenarioFile(basename)) {
      scenarioFixtureFiles.push(file);
      continue;
    }

    if (r.startsWith("config/")) config.push(file);
    else if (r.startsWith("docs/")) docs.push(file);
    else if (r === `${SRC_DIR}/instructions.py`) instructionsFile = file;
    else if (r === `${SRC_DIR}/context_builder.py`) contextBuilderFile = file;
    else if (r.startsWith(`${SRC_DIR}/`)) otherSrc.push(file);
    else if (r.startsWith("tests/") || /(^|\/)test_.*\.py$/.test(r) || /_test\.py$/.test(r)) testPyFiles.push(file);
    else if (basename === "pyproject.toml" || basename === ".env.example") projectFiles.push(file);
    else other.push(file);
  }

  return {
    config,
    docs,
    projectFiles,
    instructionsFile,
    contextBuilderFile,
    otherSrc,
    testPyFiles,
    scenarioFixtureFiles,
    other,
    all: files.filesIncluded,
  };
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
  const productsFile = config.find((f) => f.path.toLowerCase().endsWith("/products.yaml"));
  const icpFile = config.find((f) => f.path.toLowerCase().endsWith("/icp.yaml"));
  const policiesFile = config.find((f) => f.path.toLowerCase().endsWith("/policies.yaml"));

  const presence = CONFIG_FILE_DEFS.map((def) => {
    const file = config.find((f) => f.path.toLowerCase().endsWith(`/${def.filename}`));
    return { file: def.filename, present: Boolean(file), nonTrivial: (file?.content.trim().length ?? 0) > 40 };
  });

  const icpContent = icpFile?.content ?? "";
  const icpFieldsFound = ICP_FIELD_PATTERNS.filter((f) => f.pattern.test(icpContent)).map((f) => f.label);
  const icpFieldsMissing = ICP_FIELD_PATTERNS.map((f) => f.label).filter((l) => !icpFieldsFound.includes(l));

  const policiesContent = policiesFile?.content ?? "";
  const classificationsFound = REQUIRED_EVIDENCE_CLASSIFICATIONS.filter((c) => policiesContent.includes(c));
  const classificationsMissing = REQUIRED_EVIDENCE_CLASSIFICATIONS.filter((c) => !classificationsFound.includes(c));

  return {
    filePresence: presence,
    products: {
      present: Boolean(productsFile),
      offeringLikeSectionCount: productsFile ? [...new Set([...productsFile.content.matchAll(/^([a-zA-Z_][\w-]*)\s*:/gm)].map((m) => m[1]))].length : 0,
      mentionsBuyers: /buyer/i.test(productsFile?.content ?? ""),
      mentionsClaims: /claim/i.test(productsFile?.content ?? ""),
    },
    icp: {
      present: Boolean(icpFile),
      fieldsFound: icpFieldsFound,
      fieldsMissing: icpFieldsMissing,
    },
    policies: {
      present: Boolean(policiesFile),
      evidenceClassificationsFound: classificationsFound,
      evidenceClassificationsMissing: classificationsMissing,
      mentionsHumanApproval: /human[_\s-]?approval|require.{0,15}approval/i.test(policiesContent),
      mentionsProhibitedActions: /prohibit/i.test(policiesContent),
      mentionsInsufficientEvidence: /insufficient[_\s-]?evidence/i.test(policiesContent),
      mentionsPromptInjection: /prompt[_\s-]?injection/i.test(policiesContent),
    },
  };
}

function extractInstructionsEvidence(instructionsFile: GatheredFile | null) {
  const content = instructionsFile?.content ?? "";
  const requirementsFound = INSTRUCTIONS_REQUIREMENTS.filter((r) => r.pattern.test(content)).map((r) => r.label);
  const requirementsMissing = INSTRUCTIONS_REQUIREMENTS.map((r) => r.label).filter((l) => !requirementsFound.includes(l));
  const vaguePhrasesFound = VAGUE_INSTRUCTION_PATTERNS.filter((p) => p.test(content)).map((p) => p.source);

  return {
    present: Boolean(instructionsFile),
    lineCount: content ? content.split("\n").length : 0,
    exposesGetSystemInstructions: /def\s+get_system_instructions\s*\(/.test(content),
    requirementsFound,
    requirementsMissing,
    vaguePhrasesFound,
  };
}

function extractContextBuilderEvidence(contextBuilderFile: GatheredFile | null) {
  const content = contextBuilderFile?.content ?? "";
  const hasBuildContextFn = /def\s+build_context\s*\(/.test(content);
  const paramsFound = ["account", "objective", "evidence", "state"].filter((p) => new RegExp(`\\b${p}\\b`).test(content));
  const layersReturned = REQUIRED_OUTPUT_LAYERS.filter((l) => content.includes(l.key)).map((l) => l.label);
  const layersMissing = REQUIRED_OUTPUT_LAYERS.map((l) => l.label).filter((l) => !layersReturned.includes(l));

  return {
    present: Boolean(contextBuilderFile),
    lineCount: content ? content.split("\n").length : 0,
    hasBuildContextFunction: hasBuildContextFn,
    buildContextParamsFound: paramsFound,
    outputLayersReturned: layersReturned,
    outputLayersMissing: layersMissing,
    referencesYamlLoading: /yaml\.(safe_)?load|import\s+yaml/i.test(content),
    hasErrorHandlingForMissingConfig: /raise\b|except\b|FileNotFoundError/i.test(content),
    llmOrNetworkCallSignalFound: LLM_CALL_SIGNALS.test(content) || /import\s+requests\b|requests\.(get|post)\(/i.test(content),
  };
}

function extractEvidenceAndSafetyEvidence(materials: MaterialsBySection) {
  const relevant = [materials.contextBuilderFile, ...materials.scenarioFixtureFiles].filter((f): f is GatheredFile => Boolean(f));
  const combined = relevant.map((f) => f.content).join("\n");

  const provenanceFieldPatterns = [
    { key: "claim", pattern: /\bclaim\b/i },
    { key: "classification", pattern: /classification/i },
    { key: "source", pattern: /\bsource\b/i },
    { key: "retrievedAt", pattern: /retrieved_at|retrieved[_\s-]?date/i },
    { key: "excerpt", pattern: /\bexcerpt\b/i },
  ];
  const provenanceFieldsFound = provenanceFieldPatterns.filter((p) => p.pattern.test(combined)).map((p) => p.key);

  const injectionFixture = materials.scenarioFixtureFiles.find((f) => /injection/i.test(f.path.split("/").pop() ?? ""));
  const injectionFixtureLooksLikeAnAttack = injectionFixture
    ? /ignore.{0,30}(previous|prior|all).{0,20}(polic|instruction)/i.test(injectionFixture.content)
    : false;

  return {
    provenanceFieldsFound,
    provenanceFieldsMissing: provenanceFieldPatterns.map((p) => p.key).filter((k) => !provenanceFieldsFound.includes(k)),
    promptInjectionFixturePresent: Boolean(injectionFixture),
    promptInjectionFixtureLooksLikeAnAttack: injectionFixtureLooksLikeAnAttack,
  };
}

function extractScenariosAndTestsEvidence(materials: MaterialsBySection) {
  const scenarios = REQUIRED_SCENARIO_FILES.map((s) => ({
    scenario: s.label,
    fixturePresent: materials.scenarioFixtureFiles.some((f) => s.pattern.test(f.path.split("/").pop() ?? "")),
  }));

  const testCombined = materials.testPyFiles.map((f) => f.content).join("\n");
  const testFunctionCount = (testCombined.match(/^\s*(?:async\s+)?def\s+test_\w+/gm) ?? []).length;
  const assertionCount = (testCombined.match(/\bassert\b/g) ?? []).length;

  return {
    testFileCount: materials.testPyFiles.length,
    testFiles: materials.testPyFiles.map((f) => f.path),
    testFunctionCount,
    assertionCount,
    scenarioFixtures: scenarios,
    scenarioFixturesPresentCount: scenarios.filter((s) => s.fixturePresent).length,
    // §13.1-13.3: whether the test suite appears to touch each required area at all,
    // via keyword presence — not proof the tests are meaningful, just that they exist.
    testsReferenceConfig: /products|\bicp\b|policies/i.test(testCombined),
    testsReferenceInstructions: /instructions|get_system_instructions/i.test(testCombined),
    testsReferenceContextBuilder: /context_builder|build_context/i.test(testCombined),
  };
}

function extractScopeDisciplineEvidence(materials: MaterialsBySection) {
  const combined = materials.all.map((f) => f.content).join("\n");
  const deploymentFilenameFound = materials.all.some((f) => DEPLOYMENT_FILENAME_SIGNALS.test(f.path));

  return {
    adkAgentSignalFound: ADK_AGENT_SIGNALS.test(combined),
    llmCallSignalFound: LLM_CALL_SIGNALS.test(combined),
    webSearchSignalFound: WEB_SEARCH_SIGNALS.test(combined),
    externalCommsSignalFound: EXTERNAL_COMMS_SIGNALS.test(combined),
    dbPersistenceSignalFound: DB_PERSISTENCE_SIGNALS.test(combined),
    deploymentSignalFound: deploymentFilenameFound || DEPLOYMENT_CONTENT_SIGNALS.test(combined),
  };
}

// ---------------------------------------------------------------------------
// Prompt + LLM evaluation
// ---------------------------------------------------------------------------

const CLASS_03_SYSTEM_PROMPT = `You are an experienced, fair, and detail-oriented programming instructor grading a Class 3 "Build the WidgetWare SDR Context Package" submission for the Agent Engineering course, against the class's SPEC.md (summarized for you below — this is the authoritative rubric, not the class slides).

Class 3 is explicitly about building CONTEXT, not an agent. Per SPEC.md §17 (Definition of Done) and §16 (Acceptance Criteria), a correct submission has: the three config YAML files; inspectable, observable system instructions (not vague filler like "always be accurate" or "use good judgment"); a context builder returning five separate layers (system_instructions, business_context, task_context, retrieved_evidence, state); evidence records with preserved provenance; protection against prompt injection (task data can never override instructions or policy); all four required scenario fixtures and passing tests; and — critically — NO ADK agent, NO LLM/Gemini calls, NO web search, NO email/CRM/social actions, NO database persistence, and NO deployment code. A student who has built exactly this and nothing more is doing exactly what was asked — that is success, not incompleteness. Do NOT reward students for jumping ahead into Class 4's scope; if the deterministic scope-discipline evidence shows agent, LLM-call, or external-action signals, say so explicitly and reduce that component's score.

The six components you score, each on its own point scale:
- configFiles (${CONFIG_MAX_SCORE} pts): config/products.yaml (company description, at least two offerings, target buyers, approved claims, no invented customers/unsupported numbers/guaranteed outcomes), config/icp.yaml (minimum company size, preferred/excluded industries, regions, buying signals, required account fields), config/policies.yaml (the five evidence classifications verified_fact/derived_fact/inference/unknown/conflict, source requirements, prohibited actions, human-approval requirements, insufficient-evidence behavior, prompt-injection handling).
- instructions (${INSTRUCTIONS_MAX_SCORE} pts): src/widgetware_sdr/instructions.py, exposing get_system_instructions(), answering all eight questions from SPEC §9 (role, objective, allowed information, evidence classification, uncertainty handling, prohibited actions, stop conditions, escalation) with observable, testable language rather than vague generalities.
- contextBuilder (${CONTEXT_BUILDER_MAX_SCORE} pts): src/widgetware_sdr/context_builder.py, exposing build_context(account, objective, evidence, state=None) and returning the five layers as separate dict keys (system_instructions, business_context, task_context, retrieved_evidence, state) — not concatenated into one blob. Must load YAML config, raise a clear error on missing config, avoid mutating inputs, and avoid any LLM or network calls.
- evidenceAndSafety (${EVIDENCE_SAFETY_MAX_SCORE} pts): evidence records preserve provenance (claim, classification, source, retrieved_at, excerpt per SPEC §11); account notes and other task data are treated as untrusted and can never override system instructions or policy, invent customer facts, or authorize outreach/CRM changes (SPEC §10.2); the prompt-injection scenario fixture is a real attack attempt, not a placeholder.
- scenariosAndTests (${SCENARIOS_TESTS_MAX_SCORE} pts): all four required scenario fixtures exist (qualified account, unqualified account, insufficient evidence, prompt injection attempt — SPEC §12) and the test suite (SPEC §13) covers config, instructions, the context builder, and all four scenarios with real assertions.
- scopeDiscipline (${SCOPE_DISCIPLINE_MAX_SCORE} pts): full credit for staying entirely in scope; reduce it if the deterministic evidence shows an ADK agent, an LLM/Gemini call, web search, real external actions (email/CRM/social), database persistence, or deployment code — all explicitly out of scope per SPEC §5.2.

Do NOT reduce scores because a student organized files slightly differently than SPEC §6's suggested layout, added extra docs, wrote more tests than required, or used different (but reasonable) YAML key names — SPEC §3 itself says a different layout is fine as long as it preserves the same responsibilities. Judge substance over exact structure. Score each component independently: a genuinely missing piece (e.g. no context_builder.py at all) scores that component at or near 0 with feedback explaining what's missing, but does not zero out the other components.

You are given deterministic evidence extracted from the files (which config keys/classifications exist, which scenario fixtures are present by filename, which output layers the context builder returns, whether agent/LLM/external-action code was found) alongside the files themselves. Trust the evidence over your own read of a large file dump when they seem to disagree, since the evidence was computed exactly rather than skimmed.

Award 0-10 bonus points total for meaningful extensions — SPEC §19's own homework suggestions are a good reference: an extra product, an extra preferred industry, an extra prohibited action, a scenario with conflicting evidence sources classified as "conflict", or a README explaining the five context layers. List which features earned it. Always respond with the requested structured JSON only.`;

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
  const evidenceSafetyEvidence = extractEvidenceAndSafetyEvidence(materials);
  const scenariosTestsEvidence = extractScenariosAndTestsEvidence(materials);
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

## Component 4: Evidence & Safety (${EVIDENCE_SAFETY_MAX_SCORE} points) — provenance preservation, untrusted-content handling, prompt-injection resistance

### Deterministic Evidence
\`\`\`json
${JSON.stringify(evidenceSafetyEvidence, null, 2)}
\`\`\`

---

## Component 5: Scenarios & Tests (${SCENARIOS_TESTS_MAX_SCORE} points) — tests/, covering qualified account, unqualified account, insufficient evidence, and prompt injection attempt

### Deterministic Evidence
\`\`\`json
${JSON.stringify(scenariosTestsEvidence, null, 2)}
\`\`\`

### Scenario Fixture Files
${formatFiles(materials.scenarioFixtureFiles)}

### Test Files
${formatFiles(materials.testPyFiles)}

---

## Component 6: Scope Discipline (${SCOPE_DISCIPLINE_MAX_SCORE} points) — SPEC §5.2 out-of-scope list: no ADK agent, no LLM calls, no web search, no email/CRM/social actions, no DB persistence, no deployment

### Deterministic Evidence (scanned across all files in my-work/${CLASS_03_SLUG}/)
\`\`\`json
${JSON.stringify(scopeEvidence, null, 2)}
\`\`\`

${materials.docs.length > 0 ? `---\n\n## docs/\n${formatFiles(materials.docs)}` : ""}

${materials.projectFiles.length > 0 ? `---\n\n## Project files (pyproject.toml, .env.example)\n${formatFiles(materials.projectFiles)}` : ""}

${materials.other.length > 0 ? `---\n\n## Other files\n${formatFiles(materials.other)}` : ""}

---

## Task
Evaluate all six components independently — a missing or weak component only affects its own score, never the others. For each component, give a score out of its point total and specific feedback. Identify any bonus-worthy extensions (0-10 points total, list which features earned it). Give an overall pass/fail judgment, a short summary, and top-level strengths/improvements that span the whole submission (not tied to one component).`;
}

/** Attaches each component's fixed maxScore and computes overallScore server-side — never trust an LLM's own arithmetic or its restatement of a constant. */
function enrichResult(evaluation: Class03Evaluation): Class03Result {
  const configFiles = { ...evaluation.configFiles, maxScore: CONFIG_MAX_SCORE };
  const instructions = { ...evaluation.instructions, maxScore: INSTRUCTIONS_MAX_SCORE };
  const contextBuilder = { ...evaluation.contextBuilder, maxScore: CONTEXT_BUILDER_MAX_SCORE };
  const evidenceAndSafety = { ...evaluation.evidenceAndSafety, maxScore: EVIDENCE_SAFETY_MAX_SCORE };
  const scenariosAndTests = { ...evaluation.scenariosAndTests, maxScore: SCENARIOS_TESTS_MAX_SCORE };
  const scopeDiscipline = { ...evaluation.scopeDiscipline, maxScore: SCOPE_DISCIPLINE_MAX_SCORE };

  const overallScore =
    configFiles.score +
    instructions.score +
    contextBuilder.score +
    evidenceAndSafety.score +
    scenariosAndTests.score +
    scopeDiscipline.score +
    evaluation.bonus.score;

  return {
    configFiles,
    instructions,
    contextBuilder,
    evidenceAndSafety,
    scenariosAndTests,
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

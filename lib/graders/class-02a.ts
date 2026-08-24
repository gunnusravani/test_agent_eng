import { readFileContent, type GitTreeItem } from "@/lib/github";
import type { Class02aCheck, Class02aEvaluationResult, Class02aResult } from "@/types/schemas";

// This grader is written directly against the class's own grader.py, tests/test_skill_contract.py,
// and tests/test_starter_integrity.py (the ground truth the assignment is graded against locally)
// rather than paraphrased from the class slides. Every check here is a mechanical string/regex/path
// check against the repository tree — no code execution, no LLM call. (An earlier version ran the
// student's own pytest suite in a subprocess sandbox; that doesn't work on Vercel's standard Node
// serverless functions, which don't ship git/python, so it always silently skipped in production.
// test_skill_contract.py's five assertions are already fully reimplemented below in
// buildSkillChecks/buildSubmissionCheck; test_starter_integrity.py's five assertions are
// reimplemented in buildStarterIntegrityChecks — except test_calculator_is_deterministic, which
// checked an exact computed value and has no safe static equivalent, so that one is approximated
// as "is this a real, non-stub implementation" rather than "does it compute the right number".)

export const CLASS_02A_SLUG = "class-02a";
const MODEL_USED = "deterministic";

export function isClass02a(classSlug: string): boolean {
  return classSlug === CLASS_02A_SLUG;
}

const REQUIRED_L3_PATHS = [
  "references/discount-policy.md",
  "references/renewal-process.md",
  "references/risk-escalation.md",
  "assets/renewal-brief-template.md",
  "scripts/calculate_quote.py",
] as const;

const REQUIRED_L1_TERMS = ["discount", "timing", "risk", "quote", "brief"] as const;
const REQUIRED_CASE_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

// Mirrors tests/test_starter_integrity.py's test_env_example_has_one_clear_model_setting_and_both_auth_paths.
const REQUIRED_ENV_EXAMPLE_LINES = [
  "GEMINI_MODEL=gemini-3.7-flash",
  "GEMINI_API_KEY=",
  "GOOGLE_CLOUD_PROJECT=",
  "GOOGLE_CLOUD_LOCATION=",
  "GOOGLE_GENAI_USE_VERTEXAI",
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

function check(name: string, passed: boolean, maxPoints: number, feedback: string): Class02aCheck {
  return { name, passed, points: passed ? maxPoints : 0, maxPoints, feedback };
}

function buildSkillChecks(skillText: string | null): Class02aCheck[] {
  if (skillText === null) {
    const missing = "SKILL.md not found at renewal_desk_agent/skills/renewal-advisor/SKILL.md";
    return [
      check("No TODOs in SKILL.md", false, 10, missing),
      check("L1 metadata quality", false, 10, missing),
      ...REQUIRED_L3_PATHS.map((p) => check(`L2 routes exact path ${p}`, false, 6, missing)),
      check("Minimum resource loading", false, 8, missing),
      check("Missing input handling", false, 8, missing),
      check("Citations required", false, 8, missing),
      check("Unsupported questions / grounded refusal", false, 8, missing),
      check("Commercial state sequence (requested/routed/approved)", false, 8, missing),
    ];
  }

  const checks: Class02aCheck[] = [];

  const noTodo = !skillText.includes("TODO");
  checks.push(check("No TODOs in SKILL.md", noTodo, 10, noTodo ? "No TODO markers found." : "SKILL.md still contains a TODO marker."));

  const description = extractL1Description(skillText);
  const descriptionLower = description?.toLowerCase() ?? "";
  const missingTerms = REQUIRED_L1_TERMS.filter((term) => !descriptionLower.includes(term));
  const hasExclusion = descriptionLower.includes("troubleshoot"); // covers "troubleshoot" and "troubleshooting"
  const l1Passed = description !== null && description.length >= 110 && missingTerms.length === 0 && hasExclusion;
  checks.push(
    check(
      "L1 metadata quality",
      l1Passed,
      10,
      description === null
        ? "No frontmatter `description:` field found."
        : l1Passed
          ? "Description is specific, long enough, and covers all discovery/exclusion terms."
          : [
              description.length < 110 ? `too short (${description.length}/110 chars)` : null,
              missingTerms.length > 0 ? `missing terms: ${missingTerms.join(", ")}` : null,
              !hasExclusion ? 'missing "troubleshoot(ing)" exclusion' : null,
            ]
              .filter(Boolean)
              .join("; "),
    ),
  );

  for (const path of REQUIRED_L3_PATHS) {
    const present = skillText.includes(path);
    checks.push(check(`L2 routes exact path ${path}`, present, 6, present ? "Path named exactly." : `Exact path "${path}" not found in SKILL.md.`));
  }

  const lower = skillText.toLowerCase();
  const contracts: Array<[string, boolean, string]> = [
    ["Minimum resource loading", lower.includes("minimum") && lower.includes("resource"), 'Requires both "minimum" and "resource".'],
    ["Missing input handling", lower.includes("missing") && lower.includes("input"), 'Requires both "missing" and "input".'],
    ["Citations required", lower.includes("cite"), 'Requires "cite".'],
    ["Unsupported questions / grounded refusal", lower.includes("unsupported"), 'Requires "unsupported".'],
    [
      "Commercial state sequence (requested/routed/approved)",
      ["requested", "routed", "approved"].every((w) => lower.includes(w)),
      'Requires "requested", "routed", and "approved".',
    ],
  ];
  for (const [name, passed, requirement] of contracts) {
    checks.push(check(name, passed, 8, passed ? "Present." : `Missing required concept. ${requirement}`));
  }

  return checks;
}

function buildSubmissionCheck(submissionText: string | null): Class02aCheck {
  if (submissionText === null) {
    return check("SUBMISSION.md complete", false, 10, "SUBMISSION.md (or submission.md) not found.");
  }

  const noTodo = !submissionText.includes("TODO");
  const longEnough = submissionText.length >= 1800;

  const missingCases: string[] = [];
  for (const letter of REQUIRED_CASE_LETTERS) {
    const marker = `## Case ${letter}`;
    const idx = submissionText.indexOf(marker);
    if (idx === -1) {
      missingCases.push(`${letter} (section missing)`);
      continue;
    }
    let section = submissionText.slice(idx + marker.length);
    if (letter !== "F") {
      const nextIdx = section.indexOf("## Case ");
      if (nextIdx !== -1) section = section.slice(0, nextIdx);
    }
    if (!section.includes("Observed L3:")) missingCases.push(`${letter} (no "Observed L3:")`);
  }

  const passed = noTodo && longEnough && missingCases.length === 0;
  const problems = [
    !noTodo ? "contains a TODO marker" : null,
    !longEnough ? `too short (${submissionText.length}/1800 chars)` : null,
    missingCases.length > 0 ? `case issues: ${missingCases.join(", ")}` : null,
  ].filter(Boolean);

  return check(
    "SUBMISSION.md complete",
    passed,
    10,
    passed ? "All six case sections present with citations, no TODOs, sufficient length." : problems.join("; "),
  );
}

/** Mirrors test_starter_integrity.py's test_required_l3_resources_exist — the file must actually be on disk, not just named in SKILL.md's prose (buildSkillChecks only checks the latter). */
function buildResourceFilesExistCheck(tree: GitTreeItem[], skillDir: string): Class02aCheck {
  const missing = REQUIRED_L3_PATHS.filter((p) => !findBlob(tree, `${skillDir}/${p}`));
  const passed = missing.length === 0;
  return check(
    "Required L3 resource files exist on disk",
    passed,
    4,
    passed ? "All five referenced L3 resources exist as real files." : `Missing on disk: ${missing.join(", ")}.`,
  );
}

/**
 * Approximates test_starter_integrity.py's test_calculator_is_deterministic, which imports the
 * script and asserts calculate_quote(92000, 12) returns an exact value. Actually running it would
 * mean executing submitted Python, which is both unsafe and unavailable on Vercel's standard Node
 * functions — so this checks the implementation is real and non-stub instead of that it computes
 * the right number.
 */
function buildCalculatorCheck(calcText: string | null): Class02aCheck {
  if (calcText === null) {
    return check("calculate_quote.py is a real, non-stub calculator", false, 4, "scripts/calculate_quote.py not found.");
  }
  const hasFunction = /def\s+calculate_quote\s*\(/.test(calcText);
  const hasExpectedKeys = ["discount_amount", "net_arr"].every((k) => calcText.includes(k));
  const looksLikeStub = /raise\s+NotImplementedError/.test(calcText) || calcText.includes("TODO");
  const passed = hasFunction && hasExpectedKeys && !looksLikeStub;
  return check(
    "calculate_quote.py is a real, non-stub calculator",
    passed,
    4,
    passed
      ? "Defines calculate_quote() and returns discount_amount/net_arr."
      : [
          !hasFunction ? "no calculate_quote() function found" : null,
          !hasExpectedKeys ? "doesn't return discount_amount/net_arr" : null,
          looksLikeStub ? "looks like an unfinished stub" : null,
        ]
          .filter(Boolean)
          .join("; "),
  );
}

/** Mirrors test_starter_integrity.py's test_env_example_has_one_clear_model_setting_and_both_auth_paths. */
function buildEnvExampleCheck(envText: string | null): Class02aCheck {
  if (envText === null) {
    return check(".env.example has required model/auth settings", false, 4, "renewal_desk_agent/.env.example not found.");
  }
  const missing = REQUIRED_ENV_EXAMPLE_LINES.filter((line) => !envText.includes(line));
  const passed = missing.length === 0;
  return check(
    ".env.example has required model/auth settings",
    passed,
    4,
    passed ? "Model setting and both auth paths are present." : `Missing: ${missing.join(", ")}.`,
  );
}

/** Mirrors test_starter_integrity.py's test_agent_reads_model_from_environment. */
function buildAgentEnvCheck(agentText: string | null): Class02aCheck {
  if (agentText === null) {
    return check("agent.py reads model from environment", false, 3, "renewal_desk_agent/agent.py not found.");
  }
  const readsEnv = agentText.includes('os.getenv("GEMINI_MODEL"') || agentText.includes("os.getenv('GEMINI_MODEL'");
  const mentionsModel = agentText.includes("gemini-3.7-flash");
  const passed = readsEnv && mentionsModel;
  return check(
    "agent.py reads model from environment",
    passed,
    3,
    passed
      ? "Reads GEMINI_MODEL from the environment with the expected default."
      : "agent.py doesn't read GEMINI_MODEL from the environment as expected.",
  );
}

/** Mirrors test_starter_integrity.py's test_readme_has_correct_adk_web_launch_directory. */
function buildReadmeLaunchCheck(readmeText: string | null): Class02aCheck {
  if (readmeText === null) {
    return check("README has correct adk web launch instructions", false, 3, "Class README.md not found.");
  }
  const hasLaunchCmd = readmeText.includes("adk web .");
  const hasWarning = readmeText.includes("Do **not** `cd renewal_desk_agent`");
  const passed = hasLaunchCmd && hasWarning;
  return check(
    "README has correct adk web launch instructions",
    passed,
    3,
    passed ? "README documents the correct `adk web .` launch directory." : "README is missing the correct adk web launch instructions.",
  );
}

export async function evaluateClass02aAssignment(params: {
  owner: string;
  repo: string;
  tree: GitTreeItem[];
  myWorkPath: string;
}): Promise<Class02aEvaluationResult> {
  const { owner, repo, tree, myWorkPath } = params;
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

    const checks: Class02aCheck[] = [
      ...buildSkillChecks(skillText),
      buildSubmissionCheck(submissionText),
      buildResourceFilesExistCheck(tree, skillDir),
      buildCalculatorCheck(calcText),
      buildEnvExampleCheck(envExampleText),
      buildAgentEnvCheck(agentText),
      buildReadmeLaunchCheck(readmeText),
    ];

    const overallScore = checks.reduce((sum, c) => sum + c.points, 0);
    const maxScore = checks.reduce((sum, c) => sum + c.maxPoints, 0);
    const failedNames = checks.filter((c) => !c.passed).map((c) => c.name);

    const data: Class02aResult = {
      checks,
      overallScore,
      maxScore,
      pass: overallScore === maxScore,
      summary:
        failedNames.length === 0
          ? `All ${checks.length} checks passed (${overallScore}/${maxScore}).`
          : `${checks.length - failedNames.length}/${checks.length} checks passed (${overallScore}/${maxScore}). Failing: ${failedNames.join(", ")}.`,
    };

    return { status: "success", classId, data, evaluatedAt: new Date().toISOString(), modelUsed: MODEL_USED };
  } catch (error) {
    return { status: "error", classId, message: error instanceof Error ? error.message : "Unknown error grading class-02a." };
  }
}

import { MODEL_NAME, generateObjectWithRetry } from "@/lib/evaluator";
import { buildRetryPrompt } from "@/lib/prompts";
import { readFileContent, type GitTreeItem } from "@/lib/github";
import { class02bEvaluationSchema, type Class02bEvaluation, type Class02bEvaluationResult, type Class02bResult } from "@/types/schemas";
import type { AssignmentConfig, GatheredFile } from "@/types";

// This grader is written against class-02B/ADK_Multi_Agent_Build_Guide.md, the accompanying
// slide deck, and the actual starter code shipped in the class ZIP (embedded below as
// KNOWN_STARTER_* constants) — not paraphrased from memory. Unlike class-02A, there is no
// instructor-supplied grader.py/ASSIGNMENT.md/CASES.md for this class: the component
// breakdown below was designed from the guide's own 6 milestones and its "Quick validation
// checklist" (§13), and the SUBMISSION.md structure it expects is one I defined (modeled on
// that same checklist) since no submission template was provided either. Every component is
// LLM-scored, grounded by evidence extracted by diffing the submitted agent.py files against
// the known starter — same hybrid pattern as every other grader, and the same reasoning that's
// kept every grader this session static-analysis-only: ADK agents need a live Gemini API
// session to actually run, which is infeasible to execute server-side (doubly so on Vercel's
// standard Node functions, per this session's earlier timeout investigation).

export const CLASS_02B_SLUG = "class-02b";
const MODEL_USED = MODEL_NAME;

export function isClass02b(classSlug: string): boolean {
  return classSlug === CLASS_02B_SLUG;
}

const DELEGATION_STATE_MAX_SCORE = 20;
const LOOP_WORKFLOW_MAX_SCORE = 25;
const PARALLEL_WORKFLOW_MAX_SCORE = 25;
const TESTING_EVIDENCE_MAX_SCORE = 20;
const REFLECTION_MAX_SCORE = 10;

// The starter package's exact content (class-02B/adk_multiagent_systems/*), embedded so the
// prompt can compare "what changed from the baseline" directly instead of guessing.
const KNOWN_STARTER_PARENT_SUBAGENTS = `import os
import sys
import logging

sys.path.append("..")
from callback_logging import log_query_to_model, log_model_response
from dotenv import load_dotenv
import google.cloud.logging
from google.adk import Agent
from google.adk.models import Gemini
from google.genai import types
from typing import Optional, List, Dict

from google.adk.tools.tool_context import ToolContext

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from adk_utils.plugins import Graceful429Plugin
from google.adk.apps.app import App

load_dotenv()

cloud_logging_client = google.cloud.logging.Client()
cloud_logging_client.setup_logging()

RETRY_OPTIONS = types.HttpRetryOptions(initial_delay=1, max_delay=3, attempts=30)

# Tools (add the tool here when instructed)


# Agents

attractions_planner = Agent(
    name="attractions_planner",
    model=Gemini(model=os.getenv("MODEL"), retry_options=RETRY_OPTIONS),
    description="Build a list of attractions to visit in a country.",
    instruction="""
        - Provide the user options for attractions to visit within their selected country.
        """,
    before_model_callback=log_query_to_model,
    after_model_callback=log_model_response,
    # When instructed to do so, paste the tools parameter below this line

    )

travel_brainstormer = Agent(
    name="travel_brainstormer",
    model=Gemini(model=os.getenv("MODEL"), retry_options=RETRY_OPTIONS),
    description="Help a user decide what country to visit.",
    instruction="""
        Provide a few suggestions of popular countries for travelers.

        Help a user identify their primary goals of travel:
        adventure, leisure, learning, shopping, or viewing art

        Identify countries that would make great destinations
        based on their priorities.
        """,
    before_model_callback=log_query_to_model,
    after_model_callback=log_model_response,
)

root_agent = Agent(
    name="steering",
    model=Gemini(model=os.getenv("MODEL"), retry_options=RETRY_OPTIONS),
    description="Start a user on a travel adventure.",
    instruction="""
        Ask the user if they know where they'd like to travel
        or if they need some help deciding.
        """,
    generate_content_config=types.GenerateContentConfig(
        temperature=0,
    ),
    # Add the sub_agents parameter when instructed below this line

)`;

const KNOWN_STARTER_WORKFLOW_AGENTS = `# ... (imports, tools, and the researcher/screenwriter/file_writer/film_concept_team/root_agent
# definitions already present in the starter — the un-looped, non-parallel sequential pipeline).
# The starter has NO critic agent, NO writers_room LoopAgent, NO exit_loop import, NO
# box_office_researcher/casting_agent/preproduction_team ParallelAgent, and file_concept_team's
# sub_agents list is just [researcher, screenwriter, file_writer] with no loop or parallel step.
# file_writer's starter instruction only references PLOT_OUTLINE, not box_office_report/casting_report.`;

const REQUIRED_SUBMISSION_SECTIONS = [
  "Delegation routes observed",
  "Session state inspected",
  "Sequential + loop execution",
  "Parallel branches",
  "Final artifact",
] as const;

/** Case-insensitive tree lookup — student repos may use "class-02B" casing, GitHub paths are case-sensitive on disk. */
function resolveClassRoot(tree: GitTreeItem[], myWorkPath: string, slug: string): string | null {
  const target = `${myWorkPath}/${slug}`.toLowerCase();
  return tree.find((item) => item.type === "tree" && item.path.toLowerCase() === target)?.path ?? null;
}

function findBlob(tree: GitTreeItem[], path: string): GitTreeItem | undefined {
  const target = path.toLowerCase();
  return tree.find((item) => item.type === "blob" && item.path.toLowerCase() === target);
}

/** Extracts a "name = Constructor(...)" block with balanced-paren tracking (handles nested calls like Agent(model=Gemini(...))), unlike a naive regex. */
function extractAssignmentBlock(text: string, varName: string): string | null {
  const marker = new RegExp(`\\b${varName}\\s*=\\s*\\w+\\s*\\(`);
  const match = marker.exec(text);
  if (!match) return null;
  const openParenIdx = match.index + match[0].length - 1;
  let depth = 0;
  for (let i = openParenIdx; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return text.slice(match.index, i + 1);
    }
  }
  return text.slice(match.index);
}

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
// Evidence extraction (heuristic regex/string inspection against the diffed agent.py files —
// NOT an AST parse, NOT execution)
// ---------------------------------------------------------------------------

function extractDelegationStateEvidence(parentSubagentsText: string | null) {
  if (parentSubagentsText === null) return { present: false };
  const rootBlock = extractAssignmentBlock(parentSubagentsText, "root_agent") ?? "";
  const subAgentsWired = /sub_agents\s*=/.test(rootBlock) && rootBlock.includes("travel_brainstormer") && rootBlock.includes("attractions_planner");
  const stillHasPlaceholderComment = parentSubagentsText.includes("# Add the sub_agents parameter when instructed below this line");

  const hasToolFn = /def\s+save_attractions_to_state\s*\(/.test(parentSubagentsText);
  const plannerBlock = extractAssignmentBlock(parentSubagentsText, "attractions_planner") ?? "";
  const toolWired = /tools\s*=/.test(plannerBlock) && plannerBlock.includes("save_attractions_to_state");
  const instructionReadsState = /\{\s*attractions\??\s*\}/.test(plannerBlock);
  const stillHasToolPlaceholderComments =
    parentSubagentsText.includes("# Tools (add the tool here when instructed)") ||
    parentSubagentsText.includes("# When instructed to do so, paste the tools parameter below this line");

  return {
    present: true,
    subAgentsWiredOnRootAgent: subAgentsWired,
    stillHasSubAgentsPlaceholderComment: stillHasPlaceholderComment,
    saveAttractionsToStateFunctionDefined: hasToolFn,
    toolAttachedToAttractionsPlanner: toolWired,
    attractionsPlannerInstructionReadsStateBack: instructionReadsState,
    stillHasToolPlaceholderComments,
  };
}

function extractLoopWorkflowEvidence(workflowAgentsText: string | null) {
  if (workflowAgentsText === null) return { present: false };
  const hasExitLoopImport = /from\s+google\.adk\.tools\s+import[^\n]*\bexit_loop\b/.test(workflowAgentsText);
  const criticBlock = extractAssignmentBlock(workflowAgentsText, "critic") ?? "";
  const criticDefined = criticBlock.length > 0 && /\bAgent\s*\(/.test(criticBlock);
  const criticHasExitLoopTool = criticDefined && /tools\s*=/.test(criticBlock) && criticBlock.includes("exit_loop");
  const criticHasAppendToStateTool = criticDefined && /tools\s*=/.test(criticBlock) && criticBlock.includes("append_to_state");

  const loopBlock = extractAssignmentBlock(workflowAgentsText, "writers_room") ?? "";
  const loopDefined = loopBlock.length > 0 && /LoopAgent\s*\(/.test(loopBlock);
  const loopSubAgents = ["researcher", "screenwriter", "critic"].filter((name) => loopBlock.includes(name));
  const maxIterationsMatch = loopBlock.match(/max_iterations\s*=\s*(\d+)/);

  const filmTeamBlock = extractAssignmentBlock(workflowAgentsText, "film_concept_team") ?? "";
  const filmTeamUsesWritersRoom = filmTeamBlock.includes("writers_room");

  return {
    present: true,
    exitLoopImported: hasExitLoopImport,
    criticAgentDefined: criticDefined,
    criticHasExitLoopTool,
    criticHasAppendToStateTool,
    writersRoomLoopAgentDefined: loopDefined,
    writersRoomSubAgentsFound: loopSubAgents,
    writersRoomMaxIterations: maxIterationsMatch ? Number(maxIterationsMatch[1]) : null,
    filmConceptTeamUsesWritersRoom: filmTeamUsesWritersRoom,
  };
}

function extractParallelWorkflowEvidence(workflowAgentsText: string | null) {
  if (workflowAgentsText === null) return { present: false };
  const boxOfficeBlock = extractAssignmentBlock(workflowAgentsText, "box_office_researcher") ?? "";
  const boxOfficeDefined = boxOfficeBlock.length > 0 && /\bAgent\s*\(/.test(boxOfficeBlock);
  const boxOfficeHasOutputKey = boxOfficeDefined && /output_key\s*=\s*["']box_office_report["']/.test(boxOfficeBlock);

  const castingBlock = extractAssignmentBlock(workflowAgentsText, "casting_agent") ?? "";
  const castingDefined = castingBlock.length > 0 && /\bAgent\s*\(/.test(castingBlock);
  const castingHasOutputKey = castingDefined && /output_key\s*=\s*["']casting_report["']/.test(castingBlock);

  const parallelBlock = extractAssignmentBlock(workflowAgentsText, "preproduction_team") ?? "";
  const parallelDefined = parallelBlock.length > 0 && /ParallelAgent\s*\(/.test(parallelBlock);
  const parallelSubAgents = ["box_office_researcher", "casting_agent"].filter((name) => parallelBlock.includes(name));

  const filmTeamBlock = extractAssignmentBlock(workflowAgentsText, "film_concept_team") ?? "";
  const filmTeamUsesPreproductionTeam = filmTeamBlock.includes("preproduction_team");
  // Rough order check: "writers_room" should appear before "preproduction_team", which should
  // appear before "file_writer", inside the sub_agents list — matching guide §11's topology.
  const wIdx = filmTeamBlock.indexOf("writers_room");
  const pIdx = filmTeamBlock.indexOf("preproduction_team");
  const fIdx = filmTeamBlock.indexOf("file_writer");
  const orderLooksCorrect = wIdx !== -1 && pIdx !== -1 && fIdx !== -1 && wIdx < pIdx && pIdx < fIdx;

  const fileWriterBlock = extractAssignmentBlock(workflowAgentsText, "file_writer") ?? "";
  const fileWriterReferencesReports = fileWriterBlock.includes("box_office_report") && fileWriterBlock.includes("casting_report");

  return {
    present: true,
    boxOfficeResearcherDefined: boxOfficeDefined,
    boxOfficeResearcherHasOutputKey: boxOfficeHasOutputKey,
    castingAgentDefined: castingDefined,
    castingAgentHasOutputKey: castingHasOutputKey,
    preproductionTeamParallelAgentDefined: parallelDefined,
    preproductionTeamSubAgentsFound: parallelSubAgents,
    filmConceptTeamUsesPreproductionTeam: filmTeamUsesPreproductionTeam,
    filmConceptTeamSubAgentsRaw: filmTeamBlock.slice(0, 400),
    finalTopologyOrderLooksCorrect: orderLooksCorrect,
    fileWriterInstructionReferencesReports: fileWriterReferencesReports,
  };
}

function extractSubmissionEvidence(submissionText: string | null) {
  if (submissionText === null) return { present: false, sections: [], reflection: null };
  const sections = REQUIRED_SUBMISSION_SECTIONS.map((heading) => {
    const text = extractSection(submissionText, heading);
    const isPlaceholder = text === null || text.length === 0 || text === "TODO";
    return { heading, present: text !== null, isPlaceholder, text: (text ?? "").slice(0, 1500) };
  });
  const reflection = extractSection(submissionText, "Reflection");
  return { present: true, sections, reflection: (reflection ?? "").slice(0, 1500) };
}

// ---------------------------------------------------------------------------
// Prompt + LLM evaluation
// ---------------------------------------------------------------------------

const CLASS_02B_SYSTEM_PROMPT = `You are an experienced, fair, and detail-oriented programming instructor grading a Class 02B "ADK Agents to Multi-Agent Workflows" submission for the Agent Engineering course, against the class's own build guide (ADK_Multi_Agent_Build_Guide.md) and slide deck — summarized for you below, since no instructor-supplied grader.py/rubric exists for this class the way it does for other classes.

Students start from a fixed starter package (embedded below as the baseline) and build, in stages: (1) parent-to-sub-agent delegation, (2) a tool that writes to and reads back from session state, (3) a bounded LoopAgent "writers' room" with an explicit quality-gate exit condition, and (4) two independent ParallelAgent branches gathered by a downstream file-writing step. None of this can be executed here — ADK agents require a live Gemini API session — so grading is entirely from (a) diffing the submitted agent.py files against the known starter to confirm the code that would produce this behavior is genuinely present and wired correctly, and (b) the student's own SUBMISSION.md account of what they observed running it, judged for specific, plausible detail rather than generic restatement of the guide.

The five components you score, each on its own point scale:
- delegationAndState (${DELEGATION_STATE_MAX_SCORE} pts): parent_and_subagents/agent.py — root_agent's sub_agents actually lists both travel_brainstormer and attractions_planner (the starter leaves this empty with a placeholder comment); save_attractions_to_state is defined and attached to attractions_planner's tools; attractions_planner's instruction actually reads the state back via { attractions? } (not just writes it).
- loopWorkflow (${LOOP_WORKFLOW_MAX_SCORE} pts): workflow_agents/agent.py — critic is defined with both exit_loop and append_to_state as tools; writers_room is a real LoopAgent with researcher/screenwriter/critic as sub_agents and a sane max_iterations (the guide uses 5 as an example, not a hard requirement); film_concept_team's pipeline was updated to actually run writers_room instead of the bare 3-step starter sequence.
- parallelWorkflow (${PARALLEL_WORKFLOW_MAX_SCORE} pts): box_office_researcher and casting_agent are both real Agents with distinct output_key values (box_office_report / casting_report — writing to the same key would silently overwrite one branch's result, a real mistake to catch); preproduction_team is a real ParallelAgent running both; film_concept_team's final order is writers_room → preproduction_team → file_writer (order evidence is provided — verify it, don't just check presence); file_writer's instruction was updated to actually reference both report keys, not just PLOT_OUTLINE.
- testingEvidence (${TESTING_EVIDENCE_MAX_SCORE} pts): the student's SUBMISSION.md account of what they personally observed for each stage — delegation routes actually taken, session state actually inspected (state_delta, the State tab), the loop actually running multiple passes or exiting on quality, the parallel branches actually producing distinct outputs, and a final pitch file actually being created. Judge for specificity grounded in what's actually in their code (does their account use agent/state-key names that actually appear in their submitted files?) versus generic claims that could describe anyone's run or a copy of the guide's own example text.
- reflection (${REFLECTION_MAX_SCORE} pts): does the student demonstrate genuine understanding of *why* each workflow pattern fits its use case — one owner finishes it alone (single agent), intent selects a specialist (delegation), later work depends on earlier output (Sequential), quality needs another pass (Loop), tasks share input but not each other (Parallel)? Not just correct terminology — evidence they'd apply the right pattern to a new problem.

You are given deterministic evidence extracted from the files (which functions/agents/classes are defined, which are wired into which sub_agents lists, exact max_iterations value, exact output_key values, a rough ordering check on film_concept_team's final pipeline) alongside the files themselves and the known starter baseline. Trust the evidence over your own read of a large file dump when they seem to disagree, since it was computed exactly rather than skimmed. A student who left a component completely at starter-baseline (the evidence will show unchanged placeholder comments or missing definitions) should score that component at or near 0 with feedback explaining what's missing — this never affects the other components' scores.

Award 0-10 bonus points for meaningful extensions beyond the minimum: genuinely including the generated movie_pitches/*.txt artifact as evidence in the submission, a well-reasoned variation on the workflow shapes, or unusually rigorous trace evidence (e.g. actually quoting a state_delta or transfer event). List which features earned it. Always respond with the requested structured JSON only.`;

function formatFiles(files: GatheredFile[]): string {
  if (files.length === 0) return "_No files found._";
  return files.map((f) => `#### ${f.path}${f.truncated ? " _(truncated)_" : ""}\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n");
}

function buildClass02bPrompt(params: {
  assignment: AssignmentConfig;
  parentSubagentsFile: GatheredFile | null;
  workflowAgentsFile: GatheredFile | null;
  submissionFile: GatheredFile | null;
}): string {
  const { assignment, parentSubagentsFile, workflowAgentsFile, submissionFile } = params;
  const parentSubagentsText = parentSubagentsFile?.content ?? null;
  const workflowAgentsText = workflowAgentsFile?.content ?? null;
  const submissionText = submissionFile?.content ?? null;

  const delegationEvidence = extractDelegationStateEvidence(parentSubagentsText);
  const loopEvidence = extractLoopWorkflowEvidence(workflowAgentsText);
  const parallelEvidence = extractParallelWorkflowEvidence(workflowAgentsText);
  const submissionEvidence = extractSubmissionEvidence(submissionText);

  return `# Assignment: ${assignment.title}

## Objective
${assignment.objective}

## Expected Deliverables
${assignment.expectedDeliverables.map((d) => `- ${d}`).join("\n")}

---

## Known starter baseline — parent_and_subagents/agent.py (compare the student's file against this to see what genuinely changed)
\`\`\`python
${KNOWN_STARTER_PARENT_SUBAGENTS}
\`\`\`

## Known starter baseline — workflow_agents/agent.py
${KNOWN_STARTER_WORKFLOW_AGENTS}

---

## Component 1: Delegation & State (${DELEGATION_STATE_MAX_SCORE} points)

### Deterministic Evidence
\`\`\`json
${JSON.stringify(delegationEvidence, null, 2)}
\`\`\`

### parent_and_subagents/agent.py (as submitted)
${formatFiles(parentSubagentsFile ? [parentSubagentsFile] : [])}

---

## Component 2: Loop Workflow (${LOOP_WORKFLOW_MAX_SCORE} points)

### Deterministic Evidence
\`\`\`json
${JSON.stringify(loopEvidence, null, 2)}
\`\`\`

## Component 3: Parallel Workflow (${PARALLEL_WORKFLOW_MAX_SCORE} points)

### Deterministic Evidence
\`\`\`json
${JSON.stringify(parallelEvidence, null, 2)}
\`\`\`

### workflow_agents/agent.py (as submitted)
${formatFiles(workflowAgentsFile ? [workflowAgentsFile] : [])}

---

## Component 4: Testing Evidence (${TESTING_EVIDENCE_MAX_SCORE} points) — from SUBMISSION.md

### Deterministic Evidence (per-section extracted text)
\`\`\`json
${JSON.stringify(submissionEvidence.sections, null, 2)}
\`\`\`

## Component 5: Reflection (${REFLECTION_MAX_SCORE} points)

### Extracted Reflection Text
\`\`\`
${submissionEvidence.reflection || "(none found)"}
\`\`\`

---

## Task
Evaluate all five components independently — a missing or weak component only affects its own score, never the others. For each component, give a score out of its point total and specific feedback that references what was actually found (or missing) in the evidence and files above. Identify any bonus-worthy extensions (0-10 points total, list which features earned it). Give an overall pass/fail judgment, a short summary, and top-level strengths/improvements that span the whole submission (not tied to one component).`;
}

/** Attaches each component's fixed maxScore and computes overallScore server-side — never trust an LLM's own arithmetic or its restatement of a constant. pass is the LLM's own holistic judgment (same as every other specialized grader). */
function enrichResult(evaluation: Class02bEvaluation): Class02bResult {
  const delegationAndState = { ...evaluation.delegationAndState, maxScore: DELEGATION_STATE_MAX_SCORE };
  const loopWorkflow = { ...evaluation.loopWorkflow, maxScore: LOOP_WORKFLOW_MAX_SCORE };
  const parallelWorkflow = { ...evaluation.parallelWorkflow, maxScore: PARALLEL_WORKFLOW_MAX_SCORE };
  const testingEvidence = { ...evaluation.testingEvidence, maxScore: TESTING_EVIDENCE_MAX_SCORE };
  const reflection = { ...evaluation.reflection, maxScore: REFLECTION_MAX_SCORE };

  const overallScore =
    delegationAndState.score + loopWorkflow.score + parallelWorkflow.score + testingEvidence.score + reflection.score + evaluation.bonus.score;

  return {
    delegationAndState,
    loopWorkflow,
    parallelWorkflow,
    testingEvidence,
    reflection,
    bonus: evaluation.bonus,
    overallScore,
    pass: evaluation.pass,
    summary: evaluation.summary,
    strengths: evaluation.strengths,
    improvements: evaluation.improvements,
  };
}

export async function evaluateClass02bAssignment(params: {
  assignment: AssignmentConfig;
  owner: string;
  repo: string;
  tree: GitTreeItem[];
  myWorkPath: string;
}): Promise<Class02bEvaluationResult> {
  const { assignment, owner, repo, tree, myWorkPath } = params;
  const classId = CLASS_02B_SLUG;

  try {
    const classRoot = resolveClassRoot(tree, myWorkPath, CLASS_02B_SLUG);
    if (!classRoot) {
      return { status: "error", classId, message: `Could not locate my-work/${CLASS_02B_SLUG} in the repository tree.` };
    }

    const parentSubagentsPath = `${classRoot}/adk_multiagent_systems/parent_and_subagents/agent.py`;
    const workflowAgentsPath = `${classRoot}/adk_multiagent_systems/workflow_agents/agent.py`;
    const submissionPath = `${classRoot}/SUBMISSION.md`;

    const parentSubagentsBlob = findBlob(tree, parentSubagentsPath);
    const workflowAgentsBlob = findBlob(tree, workflowAgentsPath);
    const submissionBlob = findBlob(tree, submissionPath);

    const readBlob = (blob: GitTreeItem | undefined) => (blob ? readFileContent(owner, repo, blob.sha) : Promise.resolve(null));
    const [parentSubagentsText, workflowAgentsText, submissionText] = await Promise.all([
      readBlob(parentSubagentsBlob),
      readBlob(workflowAgentsBlob),
      readBlob(submissionBlob),
    ]);

    const parentSubagentsFile: GatheredFile | null =
      parentSubagentsBlob && parentSubagentsText !== null
        ? { path: parentSubagentsPath, category: "source", content: parentSubagentsText, truncated: false }
        : null;
    const workflowAgentsFile: GatheredFile | null =
      workflowAgentsBlob && workflowAgentsText !== null
        ? { path: workflowAgentsPath, category: "source", content: workflowAgentsText, truncated: false }
        : null;
    const submissionFile: GatheredFile | null =
      submissionBlob && submissionText !== null ? { path: submissionPath, category: "markdown", content: submissionText, truncated: false } : null;

    const prompt = buildClass02bPrompt({ assignment, parentSubagentsFile, workflowAgentsFile, submissionFile });

    const result = await generateObjectWithRetry({
      schema: class02bEvaluationSchema,
      system: CLASS_02B_SYSTEM_PROMPT,
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
      modelUsed: MODEL_USED,
    };
  } catch (error) {
    return { status: "error", classId, message: error instanceof Error ? error.message : "Unknown error grading class-02b." };
  }
}

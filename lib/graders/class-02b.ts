import { MODEL_NAME, generateObjectWithRetry } from "@/lib/evaluator";
import { buildRetryPrompt } from "@/lib/prompts";
import { readFileContent, type GitTreeItem } from "@/lib/github";
import { class02bEvaluationSchema, type Class02bEvaluation, type Class02bEvaluationResult, type Class02bResult } from "@/types/schemas";
import type { AssignmentConfig, GatheredFile } from "@/types";

// This grader is written against class-02B/ADK_Multi_Agent_Build_Guide.md and the actual
// starter code shipped in the class ZIP (embedded below as KNOWN_STARTER_* constants) — not
// paraphrased from memory. Unlike class-02A, there is no instructor-supplied grader.py,
// ASSIGNMENT.md, CASES.md, SKILL.md, or SUBMISSION.md for this class — the guide never asks
// students to write up or submit anything; every checkpoint (the §13 "Quick validation
// checklist", the §15 instructor demo order) is meant for interactive self-verification via
// `adk run`/`adk web`. So grading is entirely code-based: the two agent.py files, diffed
// against the known starter, are the only real deliverable, and every graded component maps
// directly to one of the guide's own "add X" milestones (2, 3, 5, 6) — the two "run and
// observe existing behavior" milestones (1, 4) aren't separately scored since students don't
// change anything for those. Every component is LLM-scored, grounded by evidence extracted by
// diffing the submitted files against the known starter — same hybrid pattern as every other
// grader, and the same reasoning that's kept every grader this session static-analysis-only:
// ADK agents need a live Gemini API session to actually run, which is infeasible to execute
// server-side (doubly so on Vercel's standard Node functions, per this session's earlier
// timeout investigation).

export const CLASS_02B_SLUG = "class-02b";
const MODEL_USED = MODEL_NAME;

export function isClass02b(classSlug: string): boolean {
  return classSlug === CLASS_02B_SLUG;
}

const DELEGATION_ROUTING_MAX_SCORE = 20;
const SHARED_STATE_MAX_SCORE = 15;
const LOOP_WORKFLOW_MAX_SCORE = 30;
const PARALLEL_WORKFLOW_MAX_SCORE = 35;

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
# box_office_researcher/casting_agent/preproduction_team ParallelAgent, and film_concept_team's
# sub_agents list is just [researcher, screenwriter, file_writer] with no loop or parallel step.
# file_writer's starter instruction only references PLOT_OUTLINE, not box_office_report/casting_report.`;

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

// ---------------------------------------------------------------------------
// Evidence extraction (heuristic regex/string inspection against the diffed agent.py files —
// NOT an AST parse, NOT execution)
// ---------------------------------------------------------------------------

/** Milestone 2: parent-to-sub-agent delegation. */
function extractDelegationRoutingEvidence(parentSubagentsText: string | null) {
  if (parentSubagentsText === null) return { present: false };
  const rootBlock = extractAssignmentBlock(parentSubagentsText, "root_agent") ?? "";
  const subAgentsWired = /sub_agents\s*=/.test(rootBlock) && rootBlock.includes("travel_brainstormer") && rootBlock.includes("attractions_planner");
  const stillHasPlaceholderComment = parentSubagentsText.includes("# Add the sub_agents parameter when instructed below this line");
  // §Milestone 2's completed example routes based on whether the user knows their destination —
  // a cheap signal the parent's instruction was actually expanded to describe routing, not left generic.
  const rootInstructionMentionsRouting = /travel_brainstormer|attractions_planner/i.test(rootBlock.split('instruction="""')[1]?.split('"""')[0] ?? "");

  return {
    present: true,
    subAgentsWiredOnRootAgent: subAgentsWired,
    stillHasSubAgentsPlaceholderComment: stillHasPlaceholderComment,
    rootInstructionMentionsSpecialistsByName: rootInstructionMentionsRouting,
  };
}

/** Milestone 3: shared session state (a tool that writes state, an instruction that reads it back). */
function extractSharedStateEvidence(parentSubagentsText: string | null) {
  if (parentSubagentsText === null) return { present: false };
  const hasToolFn = /def\s+save_attractions_to_state\s*\(/.test(parentSubagentsText);
  const plannerBlock = extractAssignmentBlock(parentSubagentsText, "attractions_planner") ?? "";
  const toolWired = /tools\s*=/.test(plannerBlock) && plannerBlock.includes("save_attractions_to_state");
  const instructionReadsState = /\{\s*attractions\??\s*\}/.test(plannerBlock);
  const stillHasToolPlaceholderComments =
    parentSubagentsText.includes("# Tools (add the tool here when instructed)") ||
    parentSubagentsText.includes("# When instructed to do so, paste the tools parameter below this line");

  return {
    present: true,
    saveAttractionsToStateFunctionDefined: hasToolFn,
    toolAttachedToAttractionsPlanner: toolWired,
    attractionsPlannerInstructionReadsStateBack: instructionReadsState,
    stillHasToolPlaceholderComments,
  };
}

/** Milestone 5: bounded LoopAgent writers' room. */
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

/** Milestone 6: ParallelAgent branches, gathered by the downstream file writer. */
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

/**
 * Optional bonus evidence: guide §12 names a generated movie_pitches/*.txt file as the tangible
 * proof of a working end-to-end run. Committing a real one (not required — it's generated
 * output, not source) is genuine evidence worth rewarding, unlike an unverifiable claim.
 */
function findMoviePitchFile(tree: GitTreeItem[], classRoot: string): GitTreeItem | undefined {
  const prefix = `${classRoot}/adk_multiagent_systems/movie_pitches/`.toLowerCase();
  return tree.find((item) => item.type === "blob" && item.path.toLowerCase().startsWith(prefix) && item.path.toLowerCase().endsWith(".txt"));
}

// ---------------------------------------------------------------------------
// Prompt + LLM evaluation
// ---------------------------------------------------------------------------

const CLASS_02B_SYSTEM_PROMPT = `You are an experienced, fair, and detail-oriented programming instructor grading a Class 02B "ADK Agents to Multi-Agent Workflows" submission for the Agent Engineering course, against the class's own build guide (ADK_Multi_Agent_Build_Guide.md) — summarized for you below, since no instructor-supplied grader.py/rubric exists for this class the way it does for other classes, and no written submission of any kind is expected (there is no SKILL.md or SUBMISSION.md for this assignment — the guide's checkpoints are all meant for interactive self-verification, never a document to hand in).

Students start from a fixed starter package (embedded below as the baseline) and build, in stages: (1) parent-to-sub-agent delegation, (2) a tool that writes to and reads back from session state, (3) a bounded LoopAgent "writers' room" with an explicit quality-gate exit condition, and (4) two independent ParallelAgent branches gathered by a downstream file-writing step. None of this can be executed here — ADK agents require a live Gemini API session — so grading is entirely from diffing the submitted agent.py files against the known starter to confirm the code that would produce this behavior is genuinely present and correctly wired, not merely present in isolation.

The four components you score, each on its own point scale:
- delegationRouting (${DELEGATION_ROUTING_MAX_SCORE} pts): parent_and_subagents/agent.py — root_agent's sub_agents actually lists both travel_brainstormer and attractions_planner (the starter leaves this empty). This is the primary requirement and should carry most of this component's weight on its own. The parent's instruction naming each specialist explicitly is a nice-to-have, not a requirement — ADK's LLM-directed delegation routes off each sub-agent's own "description" field (see slide 8: "Parent reads descriptions, Model selects a handoff"), so a submission with correct sub_agents wiring but an unchanged parent instruction is substantially, not merely partially, complete. Give it real partial credit reflecting that, not a steep penalty.
- sharedState (${SHARED_STATE_MAX_SCORE} pts): save_attractions_to_state is defined and attached to attractions_planner's tools; attractions_planner's instruction actually reads the state back via { attractions? } (not just writes it — writing without reading back is only half the milestone).
- loopWorkflow (${LOOP_WORKFLOW_MAX_SCORE} pts): workflow_agents/agent.py — critic is defined with both exit_loop and append_to_state as tools, and its instruction genuinely asks a quality-review question (not a stub); writers_room is a real LoopAgent with researcher/screenwriter/critic as sub_agents and a sane max_iterations (the guide uses 5 as an example, not a hard requirement); film_concept_team's pipeline was updated to actually run writers_room instead of the bare 3-step starter sequence.
- parallelWorkflow (${PARALLEL_WORKFLOW_MAX_SCORE} pts): box_office_researcher and casting_agent are both real Agents with distinct output_key values (box_office_report / casting_report — writing to the same key would silently overwrite one branch's result, a real mistake to catch); preproduction_team is a real ParallelAgent running both; film_concept_team's final order is writers_room → preproduction_team → file_writer (order evidence is provided — verify it, don't just check presence); file_writer's instruction was updated to actually reference both report keys, not just PLOT_OUTLINE.

You are given deterministic evidence extracted from the files (which functions/agents/classes are defined, which are wired into which sub_agents lists, exact max_iterations value, exact output_key values, a rough ordering check on film_concept_team's final pipeline) alongside the files themselves and the known starter baseline. Trust the evidence over your own read of a large file dump when they seem to disagree, since it was computed exactly rather than skimmed. A student who left a component completely at starter-baseline (the evidence will show missing definitions and no wiring at all) should score that component at or near 0 with feedback explaining what's missing — this never affects the other components' scores.

Important: some evidence fields flag whether a starter placeholder *comment* (e.g. "# Add the sub_agents parameter when instructed below this line") is still present in the file. Real student submissions often add the actual required code right next to a leftover comment they simply forgot to delete — the comment is cosmetic clutter, not a signal of incompleteness. Always judge completion by whether the real code (the wiring, the function, the class) is genuinely present, never by whether a stray comment was cleaned up. Do not penalize a submission for lacking a written explanation, reflection, or test log of any kind — none was ever asked for; judge the code on its own.

Award 0-10 bonus points for meaningful extensions beyond the minimum — genuinely committing the generated movie_pitches/*.txt artifact (provided below if present) as real proof of an end-to-end run is the strongest possible bonus signal for this assignment, since it can only exist if the whole pipeline actually executed; also consider a well-reasoned variation on the workflow shapes or unusually thoughtful instruction writing beyond the guide's own examples. List which features earned it. Always respond with the requested structured JSON only.`;

function formatFiles(files: GatheredFile[]): string {
  if (files.length === 0) return "_No files found._";
  return files.map((f) => `#### ${f.path}${f.truncated ? " _(truncated)_" : ""}\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n");
}

function buildClass02bPrompt(params: {
  assignment: AssignmentConfig;
  parentSubagentsFile: GatheredFile | null;
  workflowAgentsFile: GatheredFile | null;
  moviePitchFile: GatheredFile | null;
}): string {
  const { assignment, parentSubagentsFile, workflowAgentsFile, moviePitchFile } = params;
  const parentSubagentsText = parentSubagentsFile?.content ?? null;
  const workflowAgentsText = workflowAgentsFile?.content ?? null;

  const delegationEvidence = extractDelegationRoutingEvidence(parentSubagentsText);
  const sharedStateEvidence = extractSharedStateEvidence(parentSubagentsText);
  const loopEvidence = extractLoopWorkflowEvidence(workflowAgentsText);
  const parallelEvidence = extractParallelWorkflowEvidence(workflowAgentsText);

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

## Component 1: Delegation Routing (${DELEGATION_ROUTING_MAX_SCORE} points)

### Deterministic Evidence
\`\`\`json
${JSON.stringify(delegationEvidence, null, 2)}
\`\`\`

## Component 2: Shared State (${SHARED_STATE_MAX_SCORE} points)

### Deterministic Evidence
\`\`\`json
${JSON.stringify(sharedStateEvidence, null, 2)}
\`\`\`

### parent_and_subagents/agent.py (as submitted)
${formatFiles(parentSubagentsFile ? [parentSubagentsFile] : [])}

---

## Component 3: Loop Workflow (${LOOP_WORKFLOW_MAX_SCORE} points)

### Deterministic Evidence
\`\`\`json
${JSON.stringify(loopEvidence, null, 2)}
\`\`\`

## Component 4: Parallel Workflow (${PARALLEL_WORKFLOW_MAX_SCORE} points)

### Deterministic Evidence
\`\`\`json
${JSON.stringify(parallelEvidence, null, 2)}
\`\`\`

### workflow_agents/agent.py (as submitted)
${formatFiles(workflowAgentsFile ? [workflowAgentsFile] : [])}

---

## Bonus evidence: generated movie_pitches/*.txt artifact
${moviePitchFile ? formatFiles([moviePitchFile]) : "_None committed — this is optional generated output, not a required deliverable._"}

---

## Task
Evaluate all four components independently — a missing or weak component only affects its own score, never the others. For each component, give a score out of its point total and specific feedback that references what was actually found (or missing) in the evidence and files above. Identify any bonus-worthy extensions (0-10 points total, list which features earned it). Give an overall pass/fail judgment, a short summary, and top-level strengths/improvements that span the whole submission (not tied to one component).`;
}

/** Attaches each component's fixed maxScore and computes overallScore server-side — never trust an LLM's own arithmetic or its restatement of a constant. pass is the LLM's own holistic judgment (same as every other specialized grader). */
function enrichResult(evaluation: Class02bEvaluation): Class02bResult {
  const delegationRouting = { ...evaluation.delegationRouting, maxScore: DELEGATION_ROUTING_MAX_SCORE };
  const sharedState = { ...evaluation.sharedState, maxScore: SHARED_STATE_MAX_SCORE };
  const loopWorkflow = { ...evaluation.loopWorkflow, maxScore: LOOP_WORKFLOW_MAX_SCORE };
  const parallelWorkflow = { ...evaluation.parallelWorkflow, maxScore: PARALLEL_WORKFLOW_MAX_SCORE };

  const overallScore = delegationRouting.score + sharedState.score + loopWorkflow.score + parallelWorkflow.score + evaluation.bonus.score;

  return {
    delegationRouting,
    sharedState,
    loopWorkflow,
    parallelWorkflow,
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

    const parentSubagentsBlob = findBlob(tree, parentSubagentsPath);
    const workflowAgentsBlob = findBlob(tree, workflowAgentsPath);
    const moviePitchBlob = findMoviePitchFile(tree, classRoot);

    const readBlob = (blob: GitTreeItem | undefined) => (blob ? readFileContent(owner, repo, blob.sha) : Promise.resolve(null));
    const [parentSubagentsText, workflowAgentsText, moviePitchText] = await Promise.all([
      readBlob(parentSubagentsBlob),
      readBlob(workflowAgentsBlob),
      readBlob(moviePitchBlob),
    ]);

    const parentSubagentsFile: GatheredFile | null =
      parentSubagentsBlob && parentSubagentsText !== null
        ? { path: parentSubagentsPath, category: "source", content: parentSubagentsText, truncated: false }
        : null;
    const workflowAgentsFile: GatheredFile | null =
      workflowAgentsBlob && workflowAgentsText !== null
        ? { path: workflowAgentsPath, category: "source", content: workflowAgentsText, truncated: false }
        : null;
    const moviePitchFile: GatheredFile | null =
      moviePitchBlob && moviePitchText !== null ? { path: moviePitchBlob.path, category: "other", content: moviePitchText, truncated: false } : null;

    const prompt = buildClass02bPrompt({ assignment, parentSubagentsFile, workflowAgentsFile, moviePitchFile });

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

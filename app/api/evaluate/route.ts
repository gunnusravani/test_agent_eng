import { NextResponse } from "next/server";
import { ALL_CLASS_IDS, assignments } from "@/config/assignments";
import { GitHubError } from "@/lib/errors";
import { evaluateRepository } from "@/lib/evaluator";
import { fetchRepository, findMyWorkPath, findReadme, getRepoTree, listClassDirectories, parseGitHubUrl } from "@/lib/github";
import { gatherAllClasses } from "@/lib/parser";
import { evaluateRequestSchema, type ForkCheck, type ValidationResult } from "@/types/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = evaluateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const parsedUrl = parseGitHubUrl(parsed.data.url);
  if (!parsedUrl) {
    return NextResponse.json({ error: "Must be a github.com repository URL, e.g. https://github.com/owner/repo" }, { status: 400 });
  }

  try {
    const { owner, repo } = parsedUrl;
    const repoMetadata = await fetchRepository(owner, repo);
    const tree = await getRepoTree(owner, repo, repoMetadata.defaultBranch);

    const hasReadme = findReadme(tree);
    const myWorkPath = findMyWorkPath(tree);
    const hasMyWork = Boolean(myWorkPath);
    const presentClasses = new Set(myWorkPath ? listClassDirectories(tree, myWorkPath) : []);

    const errors: string[] = [];
    if (!hasMyWork) errors.push("Missing my-work directory.");
    const missingClasses = ALL_CLASS_IDS.filter((id) => !presentClasses.has(id));
    if (hasMyWork && missingClasses.length > 0) {
      errors.push(`Missing class folders: ${missingClasses.join(", ")}`);
    }

    const expectedForkOf = assignments["class-01"]?.expectedForkOf;
    const forkCheck: ForkCheck | null = expectedForkOf
      ? {
          expectedUpstream: expectedForkOf,
          actualUpstream: repoMetadata.parentFullName,
          ok: repoMetadata.isFork && repoMetadata.parentFullName?.toLowerCase() === expectedForkOf.toLowerCase(),
        }
      : null;

    const validation: ValidationResult = {
      valid: hasMyWork && missingClasses.length === 0,
      owner,
      repo,
      htmlUrl: repoMetadata.htmlUrl,
      hasReadme,
      hasMyWork,
      classes: ALL_CLASS_IDS.map((classId) => ({ classId, present: presentClasses.has(classId) })),
      errors,
      isFork: repoMetadata.isFork,
      parentFullName: repoMetadata.parentFullName,
      forkCheck,
    };

    if (!validation.valid) {
      return NextResponse.json({ validation });
    }

    const gatheredClasses = await gatherAllClasses({ owner, repo, tree, classIds: ALL_CLASS_IDS, myWorkPath: myWorkPath! });

    const report = await evaluateRepository({
      owner,
      repo,
      htmlUrl: repoMetadata.htmlUrl,
      validation,
      gatheredClasses,
      assignments,
    });

    return NextResponse.json({ validation, report });
  } catch (error) {
    if (error instanceof GitHubError) {
      const status = error.code === "RATE_LIMITED" ? 429 : error.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error("[api/evaluate] Unexpected error:", error);
    return NextResponse.json({ error: "An unexpected error occurred while evaluating the repository." }, { status: 500 });
  }
}

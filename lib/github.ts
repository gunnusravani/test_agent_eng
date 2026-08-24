import { Octokit } from "octokit";
import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";
import { GitHubError } from "./errors";

const RateLimitedOctokit = Octokit.plugin(retry, throttling);

const octokit = new RateLimitedOctokit({
  auth: process.env.GITHUB_TOKEN || undefined,
  throttle: {
    onRateLimit: (retryAfter: number, options: unknown, _octokit: unknown, retryCount: number) => {
      // Allow the plugin's own retry-after backoff to run, but cap it so we never
      // hang a request indefinitely on a repo we don't control.
      return retryCount < 1;
    },
    onSecondaryRateLimit: () => false,
  },
});

export interface RepoMetadata {
  owner: string;
  repo: string;
  defaultBranch: string;
  isPrivate: boolean;
  htmlUrl: string;
  isFork: boolean;
  parentFullName: string | null;
}

export interface GitTreeItem {
  path: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
}

const GITHUB_URL_PATTERN =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?(?:[#?].*)?$/i;

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.trim().match(GITHUB_URL_PATTERN);
  if (!match) return null;
  const [, owner, repo] = match;
  return { owner, repo };
}

function mapError(error: unknown): GitHubError {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: number }).status;
    const headers = (error as { response?: { headers?: Record<string, string> } }).response?.headers;

    if (status === 403 && headers?.["x-ratelimit-remaining"] === "0") {
      const resetAt = headers["x-ratelimit-reset"] ? Number(headers["x-ratelimit-reset"]) : undefined;
      return new GitHubError("RATE_LIMITED", "GitHub API rate limit exceeded. Try again later or configure GITHUB_TOKEN.", resetAt);
    }
    if (status === 404) {
      return new GitHubError("NOT_FOUND", "Repository not found. Check the URL and that the repository is public.");
    }
  }
  const message = error instanceof Error ? error.message : "Unknown GitHub API error";
  return new GitHubError("UNKNOWN", message);
}

export async function fetchRepository(owner: string, repo: string): Promise<RepoMetadata> {
  try {
    const { data } = await octokit.rest.repos.get({ owner, repo });
    if (data.private) {
      throw new GitHubError("PRIVATE", "Repository is private. Only public repositories are supported.");
    }
    return {
      owner,
      repo,
      defaultBranch: data.default_branch,
      isPrivate: data.private,
      htmlUrl: data.html_url,
      isFork: data.fork,
      parentFullName: data.parent?.full_name ?? null,
    };
  } catch (error) {
    if (error instanceof GitHubError) throw error;
    throw mapError(error);
  }
}

export async function getRepoTree(owner: string, repo: string, branch: string): Promise<GitTreeItem[]> {
  try {
    const { data } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      recursive: "1",
    });

    if (data.truncated) {
      console.warn(`[github] Tree for ${owner}/${repo}@${branch} was truncated by the GitHub API; some files may be missing.`);
    }

    return data.tree
      .filter((item): item is typeof item & { path: string; type: string; sha: string } => Boolean(item.path && item.type && item.sha))
      .map((item) => ({
        path: item.path,
        type: item.type as GitTreeItem["type"],
        sha: item.sha,
        size: item.size,
      }));
  } catch (error) {
    throw mapError(error);
  }
}

/**
 * Finds the "my-work" directory case-insensitively and returns its actual
 * (case-preserved) path, since GitHub paths are case-sensitive and course
 * instructions have used both "my-work" and "My-Work" casing.
 */
export function findMyWorkPath(tree: GitTreeItem[]): string | undefined {
  return tree.find((item) => item.type === "tree" && item.path.toLowerCase() === "my-work")?.path;
}

export function hasMyWorkDirectory(tree: GitTreeItem[]): boolean {
  return Boolean(findMyWorkPath(tree));
}

/** Case-insensitive existence check for a single class folder — not tied to any particular slug naming convention. Case-insensitive because admin class slugs are lowercase-only while student repo folders vary (e.g. "class-02A"). */
export function hasClassDirectory(tree: GitTreeItem[], myWorkPath: string, classSlug: string): boolean {
  const path = `${myWorkPath}/${classSlug}`.toLowerCase();
  return tree.some((item) => item.type === "tree" && item.path.toLowerCase() === path);
}

/** Resolves a branch name to the commit SHA it currently points at, so evaluations record the exact commit graded. */
export async function resolveBranchSha(owner: string, repo: string, branch: string): Promise<string> {
  try {
    const { data } = await octokit.rest.repos.getBranch({ owner, repo, branch });
    return data.commit.sha;
  } catch (error) {
    throw mapError(error);
  }
}

export function findReadme(tree: GitTreeItem[]): boolean {
  return tree.some((item) => item.type === "blob" && /^readme\.md$/i.test(item.path));
}

export async function readFileContent(owner: string, repo: string, sha: string): Promise<string> {
  try {
    const { data } = await octokit.rest.git.getBlob({ owner, repo, file_sha: sha });
    if (data.encoding === "base64") {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return data.content;
  } catch (error) {
    throw mapError(error);
  }
}

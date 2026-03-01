/**
 * GitHub PR Comment API
 *
 * Utilities for posting comments and reviews to GitHub pull requests.
 */

export interface PostPRCommentOptions {
  token: string;
  repo: string; // "owner/repo"
  prNumber: number;
  body: string;
}

export interface PostPRReviewOptions {
  token: string;
  repo: string; // "owner/repo"
  prNumber: number;
  body: string;
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
  commitId?: string;
}

/**
 * Post a comment on a pull request.
 * Uses GitHub REST API: POST /repos/{owner}/{repo}/issues/{issue_number}/comments
 */
export async function postPRComment(opts: PostPRCommentOptions): Promise<{ id: number; html_url: string }> {
  const { token, repo, prNumber, body } = opts;
  const apiUrl = `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ body }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as { id: number; html_url: string };
  return { id: data.id, html_url: data.html_url };
}

/**
 * Post a review on a pull request.
 * Uses GitHub REST API: POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews
 */
export async function postPRReview(opts: PostPRReviewOptions): Promise<{ id: number; html_url: string }> {
  const { token, repo, prNumber, body, event, commitId } = opts;
  const apiUrl = `https://api.github.com/repos/${repo}/pulls/${prNumber}/reviews`;

  const payload: Record<string, unknown> = {
    body,
    event,
  };

  if (commitId) {
    payload.commit_id = commitId;
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as { id: number; html_url: string };
  return { id: data.id, html_url: data.html_url };
}

/**
 * Get PR files (diff) for review.
 * Uses GitHub REST API: GET /repos/{owner}/{repo}/pulls/{pull_number}/files
 */
export async function getPRFiles(opts: {
  token: string;
  repo: string;
  prNumber: number;
}): Promise<Array<{
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}>> {
  const { token, repo, prNumber } = opts;
  const apiUrl = `https://api.github.com/repos/${repo}/pulls/${prNumber}/files`;

  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${errorBody}`);
  }

  return response.json();
}

/**
 * Get PR details.
 * Uses GitHub REST API: GET /repos/{owner}/{repo}/pulls/{pull_number}
 */
export async function getPRDetails(opts: {
  token: string;
  repo: string;
  prNumber: number;
}): Promise<{
  number: number;
  title: string;
  body: string;
  state: string;
  html_url: string;
  head: { ref: string; sha: string };
  base: { ref: string };
}> {
  const { token, repo, prNumber } = opts;
  const apiUrl = `https://api.github.com/repos/${repo}/pulls/${prNumber}`;

  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${errorBody}`);
  }

  return response.json();
}


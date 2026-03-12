import { getRemoteUrl, parseGitHubUrl } from "@/core/git";

interface ResolvedCodebaseSource {
  sourceType?: "local" | "github";
  sourceUrl?: string;
}

export function resolveCodebaseSource(repoPath: string): ResolvedCodebaseSource {
  const remoteUrl = getRemoteUrl(repoPath);
  if (!remoteUrl) return {};

  const parsed = parseGitHubUrl(remoteUrl);
  if (!parsed) return { sourceType: "local" };

  return {
    sourceType: "github",
    sourceUrl: `https://github.com/${parsed.owner}/${parsed.repo}`,
  };
}

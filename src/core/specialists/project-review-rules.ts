import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";

const PROJECT_REVIEW_RULES_PATH = [".routa", "review-rules.md"];

export function getProjectReviewRulesPath(cwd: string = process.cwd()): string {
  return path.join(cwd, ...PROJECT_REVIEW_RULES_PATH);
}

export function loadProjectReviewRules(cwd: string = process.cwd()): string | null {
  const rulesPath = getProjectReviewRulesPath(cwd);
  if (!fs.existsSync(rulesPath)) {
    return null;
  }

  const rawRules = fs.readFileSync(rulesPath, "utf-8");
  const { content } = matter(rawRules);
  const rules = content.trim();

  return rules.length > 0 ? rules : null;
}

export function formatProjectReviewRulesContext(cwd: string = process.cwd()): string {
  const rules = loadProjectReviewRules(cwd);
  if (!rules) {
    return "";
  }

  return `## Project-Specific Review Rules\n\n${rules}`;
}

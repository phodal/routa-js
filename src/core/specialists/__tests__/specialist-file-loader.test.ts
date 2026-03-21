import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  isCanonicalTeamSpecialistId,
  mergeSpecialistDefinitions,
  getLocaleOverlayDirs,
  loadSpecialistsFromDirectory,
  loadBundledSpecialists,
} from "../specialist-file-loader";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "specialist-loader-"));
  tempDirs.push(dir);
  return dir;
}

function writeYamlSpecialist(filePath: string, id: string, name: string, prompt: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `id: "${id}"
name: "${name}"
description: "${name} description"
role: "DEVELOPER"
model_tier: "smart"
system_prompt: |
  ${prompt}
`,
    "utf8"
  );
}

function writeYamlOverlay(filePath: string, id: string, name: string, prompt: string): void {
  writeYamlSpecialist(filePath, id, name, prompt);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("specialist-file-loader", () => {
  it("loads yaml specialists recursively while skipping locale directories in the base scan", () => {
    const rootDir = createTempDir();
    writeYamlSpecialist(path.join(rootDir, "core", "developer.yaml"), "developer", "Developer", "Developer body");
    writeYamlSpecialist(path.join(rootDir, "team", "qa.yaml"), "team-qa", "QA", "QA body");
    writeYamlOverlay(path.join(rootDir, "zh-CN", "developer.yaml"), "developer", "开发者", "开发者 body");
    writeYamlOverlay(path.join(rootDir, "locales", "zh-CN", "team", "qa.yaml"), "team-qa", "测试", "测试 body");

    const loaded = loadSpecialistsFromDirectory(rootDir, "bundled");

    expect(loaded.map((entry) => entry.id).sort()).toEqual(["developer", "team-qa"]);
    expect(loaded.every((entry) => entry.locale === undefined)).toBe(true);
  });

  it("loads locale overlays from both new and legacy directory layouts", () => {
    const rootDir = createTempDir();
    const newLocaleDir = path.join(rootDir, "locales", "zh-CN");
    const legacyLocaleDir = path.join(rootDir, "zh-CN");
    writeYamlOverlay(path.join(newLocaleDir, "core", "developer.yaml"), "developer", "开发者", "开发者 body");
    writeYamlOverlay(path.join(legacyLocaleDir, "review", "gate.yaml"), "gate", "验证者", "验证者 body");

    expect(getLocaleOverlayDirs(rootDir, "zh-CN").sort()).toEqual(
      [legacyLocaleDir, newLocaleDir].sort()
    );

    const loaded = getLocaleOverlayDirs(rootDir, "zh-CN").flatMap((dirPath) =>
      loadSpecialistsFromDirectory(dirPath, "bundled", "zh-CN")
    );

    expect(loaded.map((entry) => `${entry.id}:${entry.locale}`).sort()).toEqual([
      "developer:zh-CN",
      "gate:zh-CN",
    ]);
  });

  it("uses frontmatter ids for taxonomy locale overlays after filename renames", () => {
    const rootDir = createTempDir();
    const localeDir = path.join(rootDir, "locales", "en", "team");
    writeYamlOverlay(
      path.join(localeDir, "agent-lead.yaml"),
      "team-agent-lead",
      "Agent Lead",
      "Agent Lead body"
    );

    const loaded = loadSpecialistsFromDirectory(localeDir, "bundled", "en");

    expect(loaded.map((entry) => entry.id)).toEqual(["team-agent-lead"]);
    expect(loaded[0]?.locale).toBe("en");
  });

  it("keeps only canonical bundled team specialist ids", () => {
    const rootDir = createTempDir();
    writeYamlSpecialist(
      path.join(rootDir, "team", "frontend-dev.yaml"),
      "team-frontend-dev",
      "Frontend Dev",
      "Frontend body"
    );
    writeYamlSpecialist(
      path.join(rootDir, "team", "frontend-dev-lee.yaml"),
      "team-frontend-dev-lee",
      "Frontend Dev Lee",
      "Lee body"
    );

    const loaded = loadSpecialistsFromDirectory(rootDir, "bundled");

    expect(loaded.map((entry) => entry.id)).toEqual(["team-frontend-dev"]);
  });

  it("skips bundled team directory files even when they use non-team ids", () => {
    const rootDir = createTempDir();
    writeYamlSpecialist(
      path.join(rootDir, "team", "backend-dev.yaml"),
      "team-backend-dev",
      "Backend Dev",
      "Backend body"
    );
    writeYamlSpecialist(
      path.join(rootDir, "team", "backend-dev-bill.yaml"),
      "backend-dev-bill",
      "Backend Dev Bill",
      "Bill body"
    );

    const loaded = loadSpecialistsFromDirectory(rootDir, "bundled");

    expect(loaded.map((entry) => entry.id)).toEqual(["team-backend-dev"]);
  });

  it("allows non-canonical team ids in user specialist directories", () => {
    const rootDir = createTempDir();
    writeYamlSpecialist(
      path.join(rootDir, "team", "frontend-dev-lee.yaml"),
      "team-frontend-dev-lee",
      "Frontend Dev Lee",
      "Lee body"
    );

    const loaded = loadSpecialistsFromDirectory(rootDir, "user");

    expect(loaded.map((entry) => entry.id)).toEqual(["team-frontend-dev-lee"]);
  });

  it("recognizes the canonical team specialist id allowlist", () => {
    expect(isCanonicalTeamSpecialistId("team-agent-lead")).toBe(true);
    expect(isCanonicalTeamSpecialistId("team-frontend-dev")).toBe(true);
    expect(isCanonicalTeamSpecialistId("team-frontend-dev-lee")).toBe(false);
    expect(isCanonicalTeamSpecialistId("frontend-dev")).toBe(false);
  });

  it("uses the new locale overlay path for bundled specialist directories", () => {
    const repoRoot = createTempDir();
    const previousCwd = process.cwd();

    try {
      process.chdir(repoRoot);
      writeYamlOverlay(
        path.join(repoRoot, "resources", "specialists", "locales", "zh-CN", "developer.yaml"),
        "developer",
        "开发者",
        "开发者 body"
      );

      const loaded = loadBundledSpecialists("zh-CN");
      expect(loaded.map((entry) => entry.id)).toEqual(["developer"]);
      expect(loaded[0]?.locale).toBe("zh-CN");
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("ignores markdown files in runtime specialist directories", () => {
    const rootDir = createTempDir();
    fs.writeFileSync(
      path.join(rootDir, "developer.md"),
      `---
name: "Developer Markdown"
description: "Legacy runtime definition"
role: "DEVELOPER"
---

markdown prompt
`,
      "utf8"
    );
    writeYamlSpecialist(path.join(rootDir, "developer.yaml"), "developer", "Developer YAML", "yaml prompt");

    const loaded = loadSpecialistsFromDirectory(rootDir, "bundled");

    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.frontmatter.name).toBe("Developer YAML");
    expect(loaded[0]?.behaviorPrompt).toBe("yaml prompt");
  });

  it("fails when duplicate ids are merged", () => {
    const rootDir = createTempDir();
    const first = path.join(rootDir, "core", "developer.yaml");
    const second = path.join(rootDir, "review", "developer.yaml");

    writeYamlSpecialist(first, "developer", "Developer Old", "old");
    writeYamlSpecialist(second, "developer", "Developer New", "new");

    expect(() =>
      mergeSpecialistDefinitions(
        [
          {
            id: "developer",
            filePath: first,
            frontmatter: { name: "Developer Old", description: "old" },
            behaviorPrompt: "old",
            rawContent: "old",
            source: "bundled",
            locale: "zh-CN",
          },
          {
            id: "developer",
            filePath: second,
            frontmatter: { name: "Developer New", description: "new" },
            behaviorPrompt: "new",
            rawContent: "new",
            source: "bundled",
            locale: "zh-CN",
          },
        ],
        "test merge"
      )
    ).toThrowError(
      expect.objectContaining({
        message: expect.stringContaining('Duplicate specialist id "developer" in test merge'),
      })
    );
  });

  it("fails when a runtime directory contains duplicate ids", () => {
    const rootDir = createTempDir();
    writeYamlSpecialist(path.join(rootDir, "core", "developer.yaml"), "developer", "Developer", "first");
    writeYamlSpecialist(path.join(rootDir, "review", "developer.yaml"), "developer", "Developer Duplicate", "second");

    expect(() => loadSpecialistsFromDirectory(rootDir, "bundled")).toThrowError(
      expect.objectContaining({
        message: expect.stringContaining(`directory ${rootDir}`),
      })
    );
  });

  it("keeps bundled locale overlays in taxonomy paths and aligned with runtime specialists", () => {
    const bundledRoot = path.join(process.cwd(), "resources", "specialists");
    const runtimeIds = loadSpecialistsFromDirectory(bundledRoot, "bundled")
      .map((entry) => entry.id)
      .sort();
    const englishOverlayIds = loadSpecialistsFromDirectory(
      path.join(bundledRoot, "locales", "en"),
      "bundled",
      "en"
    )
      .map((entry) => entry.id)
      .sort();
    const chineseOverlayIds = loadSpecialistsFromDirectory(
      path.join(bundledRoot, "locales", "zh-CN"),
      "bundled",
      "zh-CN"
    )
      .map((entry) => entry.id)
      .sort();

    expect(fs.existsSync(path.join(bundledRoot, "zh-CN"))).toBe(false);
    expect(runtimeIds).toContain("view-git-change");
    expect(englishOverlayIds).toEqual(runtimeIds);
    expect(chineseOverlayIds).toEqual(runtimeIds);
  });
});

#!/usr/bin/env node
/**
 * Build a lightweight static docs website for GitHub Pages.
 *
 * - Converts selected markdown files under docs/ into HTML pages.
 * - Generates a home page with a curated navigation.
 * - Rewrites markdown links with .md extension to .html for generated pages.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { marked } from "marked";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");
const docsDir = path.join(rootDir, "docs");
const outputDir = path.join(rootDir, "docs-site");
const readmePath = path.join(rootDir, "README.md");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function toHtmlPath(relPath) {
  const rel = relPath.replace(/\.md$/i, ".html");
  return path.join(outputDir, rel);
}

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function rewriteMarkdownLinks(markdown) {
  return markdown.replace(
    /([`'"(])([^'"\s]+\.md)\1/g,
    (_match, wrapper, link) => `${wrapper}${link.replace(/\.md$/i, ".html")}${wrapper}`,
  );
}

function rewriteHtmlLinks(html) {
  return html.replace(
    /(href|src)=["']([^"']+\.md)(["'])/g,
    (_match, attr, link, quote) => `${attr}=${quote}${link.replace(/\.md$/i, ".html")}${quote}`,
  );
}

function extractTitle(markdown, fallback) {
  const titleLine = markdown
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));
  if (titleLine) {
    return titleLine.replace(/^#\s*/, "");
  }

  return fallback;
}

function buildPageHtml({ title, content, navGroups, activePath }) {
  const navHtml = navGroups
    .map((group) => {
      const items = group.items
        .map((item) => {
          const active = item.path === activePath ? ' class="active"' : "";
          return `<li><a href="${item.path}"${active}>${item.label}</a></li>`;
        })
        .join("\n");
      return `
      <section class="nav-group">
        <h3>${group.title}</h3>
        <ul>${items}</ul>
      </section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} | Routa Docs</title>
    <style>
      :root {
        --bg-start: #070b17;
        --bg-end: #122a48;
        --panel: rgba(15, 23, 42, 0.82);
        --text: #ecfeff;
        --muted: #94a3b8;
        --link: #7dd3fc;
        --line: #24324a;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        color: var(--text);
        background:
          radial-gradient(1200px 420px at 12% -15%, rgba(34, 211, 238, 0.2), transparent 60%),
          radial-gradient(800px 360px at 80% -8%, rgba(99, 102, 241, 0.16), transparent 58%),
          linear-gradient(180deg, var(--bg-start), var(--bg-end));
        font: 16px/1.65 "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      }
      .top {
        position: sticky;
        top: 0;
        z-index: 8;
        background: rgba(7, 11, 23, 0.86);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid var(--line);
        padding: 18px 24px;
      }
      .top h1 { margin: 0; font-size: 22px; letter-spacing: 0.01em; }
      .top .sub { color: var(--muted); margin-top: 6px; }
      .layout {
        display: grid;
        grid-template-columns: 320px minmax(0, 1fr);
        gap: 24px;
        max-width: 1220px;
        margin: 24px auto 36px;
        padding: 0 16px 16px;
      }
      nav {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 16px 14px;
        height: calc(100vh - 132px);
        overflow-y: auto;
        position: sticky;
        top: 96px;
        box-shadow: 0 20px 50px -30px #000;
      }
      .nav-group + .nav-group { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); }
      .nav-group h3 {
        margin: 0 0 8px;
        font-size: 13px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #dbeafe;
      }
      ul { list-style: none; margin: 0; padding: 0; }
      li { margin: 0; }
      a {
        color: var(--link);
        text-decoration: none;
        display: block;
        padding: 6px 10px;
        border-radius: 8px;
        transition: background 120ms ease, transform 120ms ease;
      }
      a:hover { background: rgba(34, 211, 238, 0.16); transform: translateX(2px); }
      a.active { background: linear-gradient(90deg, rgba(34, 211, 238, 0.28), rgba(125, 211, 252, 0.2)); color: #f0f9ff; }
      main {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 28px;
        min-height: 80vh;
        box-shadow: 0 20px 60px -30px #000;
      }
      h1, h2, h3, h4 { color: #f8fafc; line-height: 1.3; }
      p { color: #e2e8f0; }
      pre {
        background: #020617;
        border: 1px solid var(--line);
        padding: 16px;
        border-radius: 10px;
        overflow-x: auto;
      }
      code { background: rgba(14, 116, 144, 0.2); padding: 0.15em 0.45em; border-radius: 5px; }
      pre code { background: transparent; padding: 0; }
      img { max-width: 100%; border-radius: 10px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid var(--line); padding: 9px; }
      th { background: #0f172a; text-align: left; }
      .muted { color: var(--muted); font-size: 14px; }
      .meta {
        color: var(--muted);
        font-size: 12px;
        margin-top: 14px;
        margin-bottom: 0;
      }
      @media (max-width: 900px) {
        .layout { grid-template-columns: 1fr; gap: 16px; margin-top: 16px; }
        nav { height: auto; position: static; }
        main { padding: 20px; }
      }
    </style>
  </head>
  <body>
      <header class="top">
      <h1>Routa Documentation</h1>
      <div class="muted sub">A documentation site published with GitHub Pages</div>
    </header>
    <div class="layout">
      <nav>${navHtml}</nav>
      <main>
        ${content}
      </main>
    </div>
  </body>
</html>`;
}

function listMarkdownFiles(baseDir, rootPrefix = "") {
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const fullPath = path.join(baseDir, entry.name);
    const relPath = path.join(rootPrefix, entry.name);

    if (entry.isDirectory()) {
      if (["issues", ".git"].includes(entry.name)) {
        continue;
      }
      results.push(...listMarkdownFiles(fullPath, relPath));
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }

    if (entry.name === "_template.md") {
      continue;
    }

    results.push({ relPath: relPath.replace(/\\/g, "/"), fullPath });
  }

  return results;
}

function getUpdatedTs(fullPath) {
  try {
    const relativePath = path.relative(rootDir, fullPath);
    const output = execFileSync("git", [
      "-C",
      rootDir,
      "log",
      "-1",
      "--format=%ct",
      "--",
      relativePath,
    ], { encoding: "utf8" });

    const value = Number(output.trim());
    if (Number.isFinite(value)) {
      return value * 1000;
    }
  } catch {
    // fall back to file stats for non-git contexts
  }

  return fs.statSync(fullPath).mtimeMs;
}

function normalizeLabel(relPath) {
  const base = relPath.replace(/\.md$/i, "");
  const localeMatch = base.match(/(.*?)\.([a-z]{2}-[A-Z]{2})$/);
  if (localeMatch) {
    const [, plain, locale] = localeMatch;
    return `${plain.replace(/[-_]/g, " ")} (${locale})`;
  }

  return base.replace(/-/g, " ").replace(/_/g, " ");
}

function sectionItems(dirName) {
  const items = listMarkdownFiles(path.join(docsDir, dirName));
  return items
    .map((item) => ({
      relPath: `${dirName}/${item.relPath}`,
      fullPath: item.fullPath,
      updatedTs: getUpdatedTs(item.fullPath),
      label: normalizeLabel(item.relPath),
    }))
    .sort((a, b) => b.updatedTs - a.updatedTs);
}

function buildDocsCatalog() {
  const all = listMarkdownFiles(docsDir);
  const groups = [
    {
      title: "Get Started",
      items: [
        { relPath: "quickstart.md", label: "Quickstart" },
      ],
    },
    {
      title: "Core Docs",
      items: [
        { relPath: "ARCHITECTURE.md", label: "Architecture" },
      ],
    },
    {
      title: "Fitness",
      items: sectionItems("fitness").map(({ relPath, label }) => ({ relPath, label })),
    },
    {
      title: "Product Specs",
      items: sectionItems("product-specs").map(({ relPath, label }) => ({ relPath, label })),
    },
    {
      title: "Blog",
      items: sectionItems("blog").map(({ relPath, label }) => ({ relPath, label })),
    },
    {
      title: "Releases",
      items: sectionItems("releases").map(({ relPath, label }) => ({ relPath, label })),
    },
    {
      title: "Features",
      items: sectionItems("features").map(({ relPath, label }) => ({ relPath, label })),
    },
  ].map((group) => {
    const filtered = group.items.filter((item) =>
      all.some((candidate) => candidate.relPath === item.relPath),
    );

    const withHref = filtered.map((item) => ({
      label: item.label,
      path: item.relPath.replace(/\.md$/i, ".html"),
    }));

    return { title: group.title, items: withHref };
  });

  const readme = fs.existsSync(readmePath)
    ? {
        label: "README",
        path: "README.html",
        content: readFile(readmePath),
        title: "Routa README",
      }
    : null;

  const quickstart = all.find((item) => item.relPath === "quickstart.md");
  const quickstartTarget = quickstart
    ? quickstart.relPath.replace(/\.md$/i, ".html")
    : "quickstart.html";

  return { all, groups, readme, quickstartTarget };
}

function build() {
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  ensureDir(outputDir);

  const { all, groups, readme, quickstartTarget } = buildDocsCatalog();
  const navGroups = groups
    .filter((group) => group.items.length > 0)
    .map((group) => ({
      ...group,
      items: group.items.map((item) => ({ ...item })),
    }));

  // Build README as landing page
  if (readme) {
    const content = rewriteHtmlLinks(marked.parse(rewriteMarkdownLinks(readme.content)));
    const html = buildPageHtml({
      title: readme.title,
      content,
      navGroups,
      activePath: readme.path,
    });
    ensureDir(path.dirname(path.join(outputDir, readme.path)));
    fs.writeFileSync(path.join(outputDir, readme.path), html, "utf8");
  }

  // Build index
  const indexContent = `
  <h1>Routa Documentation</h1>
  <p>Welcome to the Routa documentation website. Open a doc from the left-side navigation, or start from <a href="${quickstartTarget}">Quickstart</a>.</p>
  <ul>
    <li>Product overview, architecture, and team workflow references.</li>
    <li>Architecture patterns and specialist orchestration details.</li>
    <li>Fitness checks used by the project for stability and quality.</li>
  </ul>
  <p>Need to dive in quickly? Jump directly to <a href="${quickstartTarget}">Quickstart</a>.</p>
  `;

  fs.writeFileSync(
    path.join(outputDir, "index.html"),
    buildPageHtml({
      title: "Routa Documentation",
      content: indexContent,
      navGroups,
      activePath: "index.html",
    }),
    "utf8",
  );

  for (const item of all) {
    const markdown = rewriteMarkdownLinks(readFile(item.fullPath));
    const rendered = rewriteHtmlLinks(marked.parse(markdown));
    const title = extractTitle(markdown, item.relPath.replace(/\.md$/, ""));
    const content = `<h1>${title}</h1>\n${rendered}`;
    const htmlOutputPath = toHtmlPath(item.relPath);
    ensureDir(path.dirname(htmlOutputPath));

    const html = buildPageHtml({
      title,
      content,
      navGroups,
      activePath: item.relPath.replace(/\.md$/i, ".html"),
    });

    fs.writeFileSync(htmlOutputPath, html, "utf8");
  }

  fs.writeFileSync(
    path.join(outputDir, "site-manifest.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        pages: all.length + (readme ? 2 : 1),
        generatedBy: "scripts/build-docs-site.mjs",
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    `Docs site generated at ${outputDir}, ${all.length} markdown pages.`,
  );
}

build();

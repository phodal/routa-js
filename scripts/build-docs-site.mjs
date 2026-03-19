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
      :root { --bg: #0b1020; --panel: #111827; --text: #e5e7eb; --muted: #94a3b8; --link: #93c5fd; --line: #1f2937; }
      body { margin: 0; background: #0b1020; color: var(--text); font: 16px/1.6 Inter, system-ui, sans-serif; }
      .top { position: sticky; top: 0; background: rgba(11,16,32,.88); backdrop-filter: blur(4px); padding: 18px 24px; border-bottom: 1px solid var(--line); }
      .top h1 { margin: 0; font-size: 20px; }
      .layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 24px; max-width: 1240px; margin: 24px auto; padding: 0 16px; }
      nav { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 16px; height: calc(100vh - 112px); overflow-y: auto; position: sticky; top: 80px; }
      .nav-group + .nav-group { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); }
      .nav-group h3 { margin: 0 0 8px; font-size: 14px; color: #d1d5db; }
      ul { list-style: none; margin: 0; padding: 0; }
      li { margin: 0; }
      a { color: var(--link); text-decoration: none; display: block; padding: 6px 4px; border-radius: 6px; }
      a:hover { background: rgba(99, 102, 241, 0.18); }
      a.active { background: rgba(59, 130, 246, 0.25); color: #dbeafe; }
      main { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 24px; min-height: 80vh; }
      h1, h2, h3, h4 { color: #f8fafc; }
      pre { background: #020617; padding: 16px; border-radius: 8px; overflow-x: auto; }
      code { background: rgba(148,163,184,0.15); padding: 0.1em 0.35em; border-radius: 4px; }
      pre code { background: transparent; padding: 0; }
      img { max-width: 100%; border-radius: 8px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid var(--line); padding: 8px; }
      th { background: #0f172a; text-align: left; }
      .muted { color: var(--muted); font-size: 14px; }
    </style>
  </head>
  <body>
    <header class="top">
      <h1>Routa Documentation</h1>
      <div class="muted">A documentation site published with GitHub Pages</div>
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
      items: listMarkdownFiles(path.join(docsDir, "fitness")).map((item) => ({
        relPath: item.relPath,
        label: item.relPath
          .replace(/^fitness\//, "")
          .replace(/\.md$/, "")
          .replace(/-/g, " ")
          .replace(/_/g, " "),
      })),
    },
    {
      title: "Product Specs",
      items: listMarkdownFiles(path.join(docsDir, "product-specs")).map((item) => ({
        relPath: item.relPath,
        label: item.relPath
          .replace(/^product-specs\//, "")
          .replace(/\.md$/, "")
          .replace(/-/g, " ")
          .replace(/_/g, " "),
      })),
    },
    {
      title: "Blog",
      items: listMarkdownFiles(path.join(docsDir, "blog")).map((item) => ({
        relPath: item.relPath,
        label: item.relPath
          .replace(/^blog\//, "")
          .replace(/\.md$/, "")
          .replace(/-/g, " ")
          .replace(/_/g, " "),
      })),
    },
    {
      title: "Releases",
      items: listMarkdownFiles(path.join(docsDir, "releases")).map((item) => ({
        relPath: item.relPath,
        label: item.relPath
          .replace(/^releases\//, "")
          .replace(/\.md$/, "")
          .replace(/-/g, " ")
          .replace(/_/g, " "),
      })),
    },
    {
      title: "Features",
      items: listMarkdownFiles(path.join(docsDir, "features")).map((item) => ({
        relPath: item.relPath,
        label: item.relPath
          .replace(/^features\//, "")
          .replace(/\.md$/, "")
          .replace(/-/g, " ")
          .replace(/_/g, " "),
      })),
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

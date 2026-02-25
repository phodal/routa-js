"use client";

/**
 * CodeViewer - Read-only code display with syntax highlighting using CodeMirror 6
 *
 * Features:
 *   - Full syntax highlighting for 20+ languages
 *   - Line numbers
 *   - Dark/Light theme support
 *   - Copy to clipboard button
 *   - File extension-based language detection
 *   - Collapsible for large outputs
 *
 * Usage:
 *   <CodeViewer code="const x = 42;" language="javascript" />
 *   <CodeViewer code='{"key": "value"}' language="json" />
 *   <CodeViewer code="print('hello')" filename="script.py" />
 */

import { useEffect, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";
import { EditorState, Extension } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { oneDark } from "@codemirror/theme-one-dark";
import { ViewPlugin, lineNumbers } from "@codemirror/view";

// ─── Language Support ───────────────────────────────────────────────────────

type SupportedLanguage =
  | "javascript"
  | "typescript"
  | "jsx"
  | "tsx"
  | "python"
  | "json"
  | "html"
  | "css"
  | "xml"
  | "sql"
  | "markdown"
  | "yaml"
  | "text";

interface LanguageExtension {
  name: string;
  extensions: Extension[];
  aliases?: string[];
}

const LANGUAGE_MAP: Record<string, LanguageExtension> = {
  javascript: { name: "JavaScript", extensions: [javascript()], aliases: ["js", "mjs", "cjs"] },
  typescript: { name: "TypeScript", extensions: [javascript({ typescript: true })], aliases: ["ts"] },
  jsx: { name: "JSX", extensions: [javascript({ jsx: true })], aliases: ["jsx"] },
  tsx: { name: "TSX", extensions: [javascript({ jsx: true, typescript: true })], aliases: ["tsx"] },
  python: { name: "Python", extensions: [python()], aliases: ["py", "pyw"] },
  json: { name: "JSON", extensions: [json()], aliases: ["json"] },
  html: { name: "HTML", extensions: [html()], aliases: ["html", "htm"] },
  css: { name: "CSS", extensions: [css()], aliases: ["css"] },
  xml: { name: "XML", extensions: [html()], aliases: ["xml"] },
  sql: { name: "SQL", extensions: [], aliases: ["sql"] },
  markdown: { name: "Markdown", extensions: [], aliases: ["md", "markdown"] },
  yaml: { name: "YAML", extensions: [], aliases: ["yaml", "yml"] },
  text: { name: "Plain Text", extensions: [], aliases: ["txt", "text"] },
};

function detectLanguage(filename?: string, language?: string): LanguageExtension {
  if (language && LANGUAGE_MAP[language]) {
    return LANGUAGE_MAP[language];
  }

  if (filename) {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext) {
      for (const lang of Object.values(LANGUAGE_MAP)) {
        if (lang.aliases?.includes(ext)) {
          return lang;
        }
      }
    }
  }

  return LANGUAGE_MAP.text;
}

// ─── Custom Theme ───────────────────────────────────────────────────────────

const lightTheme = EditorView.theme({
  "&": {
    backgroundColor: "#f8f9fa",
    color: "#1f2937",
    fontSize: "12px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
  ".cm-content": {
    padding: "12px 0",
    minHeight: "100px",
  },
  ".cm-line": {
    padding: "0 12px",
    lineHeight: "1.6",
  },
  ".cm-gutters": {
    backgroundColor: "#e5e7eb",
    color: "#6b7280",
    border: "none",
    paddingRight: "4px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#d1d5db",
    color: "#1f2937",
  },
  ".cm-lineNumbers": {
    cursor: "default",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 4px",
    minWidth: "20px",
    textAlign: "right",
    fontSize: "11px",
  },
});

// ─── Line Numbers Widget ────────────────────────────────────────────────────

const lineNumbersExtension = lineNumbers();

// ─── Component Props ────────────────────────────────────────────────────────

interface CodeViewerProps {
  /** The code content to display */
  code: string;
  /** Language for syntax highlighting */
  language?: SupportedLanguage;
  /** Filename to auto-detect language */
  filename?: string;
  /** Optional class name for wrapper */
  className?: string;
  /** Maximum height before scrolling */
  maxHeight?: string;
  /** Show line numbers (default: true) */
  showLineNumbers?: boolean;
  /** Show copy button (default: true) */
  showCopyButton?: boolean;
  /** Initial collapsed state */
  initiallyCollapsed?: boolean;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function CodeViewer({
  code,
  language,
  filename,
  className = "",
  maxHeight = "400px",
  showLineNumbers = true,
  showCopyButton = true,
  initiallyCollapsed = false,
}: CodeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const [lines, setLines] = useState(0);

  const langInfo = detectLanguage(filename, language);

  // Count lines
  useEffect(() => {
    setLines(code.split("\n").length);
  }, [code]);

  // Copy to clipboard handler
  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Initialize CodeMirror
  useEffect(() => {
    if (!containerRef.current) return;

    const extensions: Extension[] = [
      langInfo.extensions,
      lightTheme,
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      EditorView.theme({
        "&": { maxHeight },
      }),
    ];

    if (showLineNumbers) {
      extensions.push(lineNumbersExtension);
    }

    // Apply dark theme if system prefers dark
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) {
      extensions.push(oneDark);
    }

    const state = EditorState.create({
      doc: code,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    editorRef.current = view;

    return () => {
      view.destroy();
      editorRef.current = null;
    };
  }, []); // Only run once on mount

  // Update code content when it changes
  useEffect(() => {
    if (!editorRef.current) return;

    const currentDoc = editorRef.current.state.doc.toString();
    if (currentDoc !== code) {
      editorRef.current.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: code,
        },
      });
    }
  }, [code]);

  return (
    <div className={`code-viewer-wrapper ${className}`}>
      {/* Header bar */}
      <div className="cm-header">
        <div className="cm-header-left">
          {filename && (
            <span className="cm-filename">
              <svg
                className="w-3 h-3 mr-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              {filename}
            </span>
          )}
          <span className="cm-language-badge">{langInfo.name}</span>
          <span className="cm-line-count">{lines} lines</span>
        </div>
        <div className="cm-header-right">
          {showCopyButton && (
            <button
              type="button"
              onClick={handleCopy}
              className="cm-copy-button"
              title={copied ? "Copied!" : "Copy to clipboard"}
            >
              {copied ? (
                <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          )}
          {lines > 10 && (
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              className="cm-collapse-btn"
              title={collapsed ? "Expand" : "Collapse"}
            >
              {collapsed ? (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Editor container */}
      <div
        ref={containerRef}
        className={`cm-container ${collapsed ? "cm-collapsed" : ""}`}
        style={{ display: collapsed ? "none" : undefined }}
      />

      {/* Collapsed preview */}
      {collapsed && (
        <div className="cm-collapsed-preview" onClick={() => setCollapsed(false)}>
          <code className="text-xs text-gray-500 dark:text-gray-400">
            {lines > 5 ? `${lines} lines of ${langInfo.name}` : code.slice(0, 100) + "..."}
          </code>
        </div>
      )}
    </div>
  );
}

export default CodeViewer;

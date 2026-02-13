"use client";

/**
 * TiptapInput - Rich text chat input powered by Tiptap
 *
 * Features:
 *   - StarterKit (bold, italic, lists, blockquote, code)
 *   - Code blocks with syntax highlighting (lowlight)
 *   - Placeholder text
 *   - Enter to send, Shift+Enter for newline
 *   - Image paste support
 *   - Link support
 *   - Task list support
 *   - @ to mention/select agents
 *   - / to select skills
 *   - GitHub clone button (bottom-left)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Mention from "@tiptap/extension-mention";
import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { common, createLowlight } from "lowlight";
import type { SkillSummary } from "../skill-client";

const lowlight = createLowlight(common);

// ─── EnterToSend Extension ─────────────────────────────────────────────

const EnterToSend = Extension.create({
  name: "enterToSend",
  addOptions() {
    return { onSend: () => {} };
  },
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from } = editor.state.selection;
        if ($from.parent.type.name === "codeBlock") return false;
        const text = editor.getText().trim();
        if (!text) return true;
        this.options.onSend();
        return true;
      },
    };
  },
});

// ─── Suggestion dropdown (vanilla DOM, works for both @ and /) ─────────

interface SuggestionItem {
  id: string;
  label: string;
  description?: string;
  type?: string;
  disabled?: boolean;
}

function createSuggestionDropdown() {
  let popup: HTMLDivElement | null = null;
  let selectedIndex = 0;
  let currentItems: SuggestionItem[] = [];
  let currentCommand: ((item: SuggestionItem) => void) | null = null;

  const renderList = () => {
    const p = popup;
    if (!p) return;
    p.innerHTML = "";
    if (currentItems.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText =
        "padding: 8px 12px; color: #9ca3af; font-size: 12px;";
      empty.textContent = "No results";
      p.appendChild(empty);
      return;
    }
    currentItems.forEach((item, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      const isSelected = index === selectedIndex;
      btn.style.cssText = `
        display: flex; align-items: center; gap: 8px; width: 100%;
        text-align: left; padding: 6px 10px; border: none; cursor: pointer;
        border-radius: 4px; font-size: 13px; line-height: 1.4;
        background: ${isSelected ? "#3b82f6" : "transparent"};
        color: ${isSelected ? "#fff" : "inherit"};
        opacity: ${item.disabled ? "0.5" : "1"};
      `;
      btn.innerHTML = `
        <span style="font-weight: 500;">${item.label}</span>
        ${item.description ? `<span style="opacity: 0.5; font-size: 11px; margin-left: auto; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.description}</span>` : ""}
      `;
      btn.onclick = () => {
        if (!item.disabled && currentCommand) currentCommand(item);
      };
      btn.onmouseenter = () => {
        selectedIndex = index;
        renderList();
      };
      p.appendChild(btn);
    });
  };

  return {
    onStart: (props: any) => {
      currentItems = props.items || [];
      currentCommand = props.command;
      selectedIndex = 0;

      popup = document.createElement("div");
      popup.className = "suggestion-popup";
      popup.style.cssText = `
        position: fixed; z-index: 100; min-width: 220px; max-width: 360px;
        max-height: 240px; overflow-y: auto; padding: 4px;
        background: #1e2130; color: #e5e7eb; border: 1px solid #374151;
        border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      `;
      // Light mode detection
      if (
        typeof window !== "undefined" &&
        !window.matchMedia("(prefers-color-scheme: dark)").matches
      ) {
        popup.style.background = "#fff";
        popup.style.color = "#1f2937";
        popup.style.border = "1px solid #e5e7eb";
        popup.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)";
      }

      renderList();
      document.body.appendChild(popup);

      const rect = props.clientRect?.();
      if (rect && popup) {
        popup.style.left = `${rect.left}px`;
        popup.style.top = `${rect.top - popup.offsetHeight - 8}px`;
        // If above goes offscreen, put below
        if (parseInt(popup.style.top) < 0) {
          popup.style.top = `${rect.bottom + 4}px`;
        }
      }
    },
    onUpdate: (props: any) => {
      currentItems = props.items || [];
      currentCommand = props.command;
      selectedIndex = 0;
      renderList();
      const rect = props.clientRect?.();
      if (rect && popup) {
        popup.style.left = `${rect.left}px`;
        popup.style.top = `${rect.top - popup.offsetHeight - 8}px`;
        if (parseInt(popup.style.top) < 0) {
          popup.style.top = `${rect.bottom + 4}px`;
        }
      }
    },
    onKeyDown: (props: any) => {
      if (props.event.key === "Escape") return true;
      if (!currentItems.length) return false;
      if (props.event.key === "ArrowDown") {
        selectedIndex = (selectedIndex + 1) % currentItems.length;
        renderList();
        return true;
      }
      if (props.event.key === "ArrowUp") {
        selectedIndex =
          (selectedIndex - 1 + currentItems.length) % currentItems.length;
        renderList();
        return true;
      }
      if (props.event.key === "Enter") {
        const item = currentItems[selectedIndex];
        if (item && !item.disabled && currentCommand) currentCommand(item);
        return true;
      }
      return false;
    },
    onExit: () => {
      if (popup?.parentNode) popup.parentNode.removeChild(popup);
      popup = null;
    },
  };
}

// ─── Agent Mention Extension (@ trigger) ───────────────────────────────

const AGENT_ITEMS: SuggestionItem[] = [
  {
    id: "CRAFTER",
    label: "CRAFTER",
    description: "Code generation agent",
    type: "agent",
  },
  {
    id: "ROUTA",
    label: "ROUTA",
    description: "Coming soon",
    type: "agent",
    disabled: true,
  },
  {
    id: "GATE",
    label: "GATE",
    description: "Coming soon",
    type: "agent",
    disabled: true,
  },
];

const AgentMention = Mention.extend({ name: "agentMention" }).configure({
  HTMLAttributes: {
    class: "agent-mention",
    "data-type": "agent",
  },
  renderHTML({ node }) {
    return [
      "span",
      {
        class: "agent-mention",
        "data-type": "agent",
        "data-id": node.attrs.id,
      },
      `@${node.attrs.label ?? node.attrs.id}`,
    ];
  },
  suggestion: {
    char: "@",
    pluginKey: new PluginKey("agentMention"),
    items: ({ query }: { query: string }) => {
      return AGENT_ITEMS.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase())
      );
    },
    render: createSuggestionDropdown,
  },
});

// ─── Skill Command Extension (/ trigger) ───────────────────────────────

function createSkillMention(
  getSkills: () => SuggestionItem[]
) {
  return Mention.extend({ name: "skillMention" }).configure({
    HTMLAttributes: {
      class: "skill-mention",
      "data-type": "skill",
    },
    renderHTML({ node }) {
      return [
        "span",
        {
          class: "skill-mention",
          "data-type": "skill",
          "data-id": node.attrs.id,
        },
        `/${node.attrs.label ?? node.attrs.id}`,
      ];
    },
    suggestion: {
      char: "/",
      pluginKey: new PluginKey("skillMention"),
      items: ({ query }: { query: string }) => {
        const skills = getSkills();
        if (!query) return skills;
        return skills.filter((s) =>
          s.label.toLowerCase().includes(query.toLowerCase())
        );
      },
      render: createSuggestionDropdown,
    },
  });
}

// ─── Main Component ────────────────────────────────────────────────────

export interface InputContext {
  /** Agent selected via @ mention (e.g. "CRAFTER") */
  agent?: string;
  /** Skill selected via / command (e.g. "find-skills") */
  skill?: string;
  /** Working directory (e.g. cloned repo path) */
  cwd?: string;
}

interface TiptapInputProps {
  onSend: (text: string, context: InputContext) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  skills?: SkillSummary[];
  clonedCwd?: string | null;
  onClone?: (url: string) => Promise<void>;
}

export function TiptapInput({
  onSend,
  placeholder = "Type a message...",
  disabled = false,
  loading = false,
  skills = [],
  clonedCwd = null,
  onClone,
}: TiptapInputProps) {
  const [showClonePopover, setShowClonePopover] = useState(false);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);

  // Ref for skills so the Mention extension always has latest
  const skillsRef = useRef<SuggestionItem[]>([]);
  skillsRef.current = skills.map((s) => ({
    id: s.name,
    label: s.name,
    description: s.description,
    type: "skill",
  }));

  const handleSend = useCallback(() => {
    if (!editor || disabled || loading) return;

    // Extract mentions from the editor content
    const json = editor.getJSON();
    let agent: string | undefined;
    let skill: string | undefined;

    // Walk the document to find mentions
    const walk = (node: any) => {
      if (node.type === "agentMention" && node.attrs?.id) {
        agent = node.attrs.id;
      }
      if (node.type === "skillMention" && node.attrs?.id) {
        skill = node.attrs.id;
      }
      if (node.content) {
        node.content.forEach(walk);
      }
    };
    walk(json);

    const text = editor.getText().trim();
    if (!text) return;

    // Remove the @agent and /skill tokens from the text for the prompt
    let cleanText = text;
    if (agent) {
      cleanText = cleanText.replace(new RegExp(`@${agent}\\s*`, "g"), "").trim();
    }
    if (skill) {
      cleanText = cleanText.replace(new RegExp(`/${skill}\\s*`, "g"), "").trim();
    }

    onSend(cleanText || text, {
      agent,
      skill,
      cwd: clonedCwd ?? undefined,
    });
    editor.commands.clearContent();
  }, [onSend, disabled, loading, clonedCwd]);

  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        code: {
          HTMLAttributes: {
            class:
              "px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs font-mono",
          },
        },
        blockquote: {
          HTMLAttributes: {
            class:
              "border-l-2 border-gray-300 dark:border-gray-600 pl-3 italic text-gray-600 dark:text-gray-400",
          },
        },
        bulletList: { HTMLAttributes: { class: "list-disc ml-4" } },
        orderedList: { HTMLAttributes: { class: "list-decimal ml-4" } },
        hardBreak: {},
      }),
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class:
            "bg-gray-50 dark:bg-[#0d0f17] rounded-lg p-3 text-xs font-mono overflow-x-auto my-1 border border-gray-100 dark:border-gray-800",
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
        showOnlyWhenEditable: true,
        showOnlyCurrent: true,
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: { class: "max-w-full rounded-md max-h-48" },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-blue-500 underline cursor-pointer" },
      }),
      TaskList.configure({
        HTMLAttributes: { class: "pl-0 list-none" },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: { class: "flex items-start gap-2" },
      }),
      AgentMention,
      createSkillMention(() => skillsRef.current),
      EnterToSend.configure({
        onSend: () => handleSendRef.current(),
      }),
    ],
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          "tiptap-chat-input outline-none min-h-[24px] max-h-[160px] overflow-y-auto text-sm text-gray-900 dark:text-gray-100",
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (items) {
          for (const item of Array.from(items)) {
            if (item.type.startsWith("image/")) {
              event.preventDefault();
              const file = item.getAsFile();
              if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                  const src = e.target?.result as string;
                  if (src) {
                    view.dispatch(
                      view.state.tr.replaceSelectionWith(
                        view.state.schema.nodes.image.create({ src })
                      )
                    );
                  }
                };
                reader.readAsDataURL(file);
              }
              return true;
            }
          }
        }
        return false;
      },
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [editor, disabled]);

  // Listen for external send button click
  useEffect(() => {
    const fn = () => handleSendRef.current();
    window.addEventListener("tiptap:send-click", fn);
    return () => window.removeEventListener("tiptap:send-click", fn);
  }, []);

  // Clone handler
  const handleClone = useCallback(async () => {
    if (!cloneUrl.trim() || !onClone) return;
    setCloning(true);
    setCloneError(null);
    try {
      await onClone(cloneUrl.trim());
      setShowClonePopover(false);
      setCloneUrl("");
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : "Clone failed");
    } finally {
      setCloning(false);
    }
  }, [cloneUrl, onClone]);

  return (
    <div className="flex-1 flex flex-col gap-1.5">
      {/* CWD indicator */}
      {clonedCwd && (
        <div className="flex items-center gap-1.5 px-1">
          <svg
            className="w-3 h-3 text-green-500 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
          <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono truncate">
            {clonedCwd}
          </span>
        </div>
      )}

      {/* Editor wrapper */}
      <div
        className={`tiptap-input-wrapper relative px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#161922] transition-colors focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent ${
          disabled ? "opacity-40 cursor-not-allowed" : ""
        }`}
      >
        <EditorContent editor={editor} />

        {/* Bottom toolbar */}
        <div className="flex items-center gap-1 mt-1.5 -mb-0.5">
          {/* GitHub clone button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowClonePopover((v) => !v)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Clone GitHub repo"
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              Clone
            </button>

            {/* Clone popover */}
            {showClonePopover && (
              <div className="absolute bottom-full left-0 mb-2 w-80 p-3 rounded-lg bg-white dark:bg-[#1e2130] border border-gray-200 dark:border-gray-700 shadow-xl z-50">
                <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Clone GitHub Repository
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={cloneUrl}
                    onChange={(e) => setCloneUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    className="flex-1 px-2.5 py-1.5 text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#161922] text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder:text-gray-400"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleClone();
                      if (e.key === "Escape") setShowClonePopover(false);
                    }}
                    autoFocus
                  />
                  <button
                    onClick={handleClone}
                    disabled={cloning || !cloneUrl.trim()}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-40"
                  >
                    {cloning ? "..." : "Clone"}
                  </button>
                </div>
                {cloneError && (
                  <div className="mt-1.5 text-[10px] text-red-500">
                    {cloneError}
                  </div>
                )}
                <div className="mt-1.5 text-[10px] text-gray-400">
                  The repo will be cloned and used as the agent working
                  directory.
                </div>
              </div>
            )}
          </div>

          {/* Hints */}
          <span className="text-[10px] text-gray-300 dark:text-gray-600 ml-auto">
            <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 font-mono">@</kbd> agent
            <span className="mx-1.5">&middot;</span>
            <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 font-mono">/</kbd> skill
          </span>
        </div>
      </div>
    </div>
  );
}

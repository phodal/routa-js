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
 *   - Auto-growing height
 */

import { useCallback, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Extension } from "@tiptap/core";
import { common, createLowlight } from "lowlight";

// Create lowlight instance with common languages
const lowlight = createLowlight(common);

/**
 * Custom extension to handle Enter key for sending messages.
 * Enter = send, Shift+Enter = newline.
 */
const EnterToSend = Extension.create({
  name: "enterToSend",

  addOptions() {
    return {
      onSend: () => {},
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        // If shift is held, insert a newline (default behavior)
        // We can't detect shift here directly, so we use a different approach
        // Shift+Enter is handled by the hard break extension in StarterKit
        const { state } = editor;
        const { selection } = state;
        const { $from } = selection;

        // Don't send if we're inside a code block
        if ($from.parent.type.name === "codeBlock") {
          return false;
        }

        // Don't send if text is empty
        const text = editor.getText().trim();
        if (!text) {
          return true; // Consume the event but don't send
        }

        this.options.onSend();
        return true;
      },
    };
  },
});

interface TiptapInputProps {
  onSend: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
}

export function TiptapInput({
  onSend,
  placeholder = "Type a message...",
  disabled = false,
  loading = false,
}: TiptapInputProps) {
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const handleSend = useCallback(() => {
    if (!editor || disabled || loading) return;
    const text = editor.getText().trim();
    if (!text) return;
    onSend(text);
    editor.commands.clearContent();
  }, [onSend, disabled, loading]);

  // We need to create the handleSend ref so the extension can use the latest version
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false, // We use CodeBlockLowlight instead
        code: {
          HTMLAttributes: {
            class: "px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs font-mono",
          },
        },
        blockquote: {
          HTMLAttributes: {
            class: "border-l-2 border-gray-300 dark:border-gray-600 pl-3 italic text-gray-600 dark:text-gray-400",
          },
        },
        bulletList: {
          HTMLAttributes: {
            class: "list-disc ml-4",
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: "list-decimal ml-4",
          },
        },
        hardBreak: {}, // Shift+Enter creates hard break
      }),
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class: "bg-gray-50 dark:bg-[#0d0f17] rounded-lg p-3 text-xs font-mono overflow-x-auto my-1 border border-gray-100 dark:border-gray-800",
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
        HTMLAttributes: {
          class: "max-w-full rounded-md max-h-48",
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-500 underline cursor-pointer",
        },
      }),
      TaskList.configure({
        HTMLAttributes: {
          class: "pl-0 list-none",
        },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: "flex items-start gap-2",
        },
      }),
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
        // Handle image paste
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
    // Immediate render mode for React 19
    immediatelyRender: false,
  });

  // Update editable state when disabled changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [editor, disabled]);

  // Listen for external send button click
  useEffect(() => {
    const handleExternalSend = () => {
      handleSendRef.current();
    };
    window.addEventListener("tiptap:send-click", handleExternalSend);
    return () => {
      window.removeEventListener("tiptap:send-click", handleExternalSend);
    };
  }, []);

  return (
    <div
      ref={editorContainerRef}
      className={`tiptap-input-wrapper flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#161922] transition-colors focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent ${
        disabled ? "opacity-40 cursor-not-allowed" : ""
      }`}
    >
      <EditorContent editor={editor} />
    </div>
  );
}

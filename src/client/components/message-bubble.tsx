import React, {useEffect, useMemo, useState} from "react";
import {TerminalBubble} from "@/client/components/terminal/terminal-bubble";
import {ChatMessage, PlanEntry} from "@/client/components/chat-panel";
import {MarkdownViewer} from "@/client/components/markdown/markdown-viewer";
import {CodeViewer} from "@/client/components/codemirror/code-viewer";
import {TaskProgressBar, TaskInfo} from "@/client/components/task-progress-bar";

interface AskUserQuestionOption {
    label: string;
    description?: string;
}

interface AskUserQuestionItem {
    question: string;
    header: string;
    options?: AskUserQuestionOption[];
    multiSelect?: boolean;
}

interface AskUserQuestionPayload {
    questions?: AskUserQuestionItem[];
    answers?: Record<string, string>;
}

export function MessageBubble({
    message,
    onSubmitAskUserQuestion,
}: {
    message: ChatMessage;
    onSubmitAskUserQuestion?: (toolCallId: string, response: Record<string, unknown>) => Promise<void>;
}) {
    const {role} = message;
    switch (role) {
        case "user":
            return <UserBubble content={message.content}/>;
        case "assistant":
            return <AssistantBubble content={message.content}/>;
        case "thought":
            return <ThoughtBubble content={message.content}/>;
        case "tool":
            // Use TaskBubble for task tool calls
            if (message.toolKind === "task") {
                return (
                    <TaskBubble
                        content={message.content}
                        toolStatus={message.toolStatus}
                        rawInput={message.toolRawInput}
                    />
                );
            }
            if (isAskUserQuestionMessage(message)) {
                return (
                    <AskUserQuestionBubble
                        message={message}
                        onSubmit={onSubmitAskUserQuestion}
                    />
                );
            }
            return (
                <ToolBubble
                    content={message.content}
                    toolName={message.toolName}
                    toolStatus={message.toolStatus}
                    toolKind={message.toolKind}
                    rawInput={message.toolRawInput}
                />
            );
        case "terminal":
            return (
                <TerminalBubble
                    terminalId={message.terminalId ?? message.id}
                    command={message.terminalCommand}
                    args={message.terminalArgs}
                    data={message.content}
                    exited={message.terminalExited}
                    exitCode={message.terminalExitCode}
                />
            );
        case "plan":
            return <PlanBubble content={message.content} entries={message.planEntries}/>;
        case "info":
            if (message.usageUsed !== undefined) {
                return (
                    <UsageBadge
                        used={message.usageUsed}
                        size={message.usageSize}
                        costAmount={message.costAmount}
                        costCurrency={message.costCurrency}
                    />
                );
            }
            return <InfoBubble content={message.content} rawData={message.rawData}/>;
        default:
            return null;
    }
}

function UserBubble({content}: { content: string }) {
    return (
        <div className="w-full">
            <div
                className="w-full px-3 py-2 rounded-xl border border-blue-100/70 dark:border-blue-900/30 bg-blue-50/60 dark:bg-blue-900/10 text-sm text-blue-900 dark:text-blue-100 whitespace-pre-wrap">
                {content}
            </div>
        </div>
    );
}

export function isAskUserQuestionMessage(message: ChatMessage): boolean {
    if (message.toolKind === "ask-user-question") return true;
    if (message.toolName === "AskUserQuestion") return true;
    const payload = message.toolRawInput as AskUserQuestionPayload | undefined;
    return Array.isArray(payload?.questions) && payload.questions.length > 0;
}

function AssistantBubble({content}: { content: string }) {
    return (
        <div className="w-full">
            <div
                className="w-full px-3 py-2 rounded-xl border border-gray-200/70 dark:border-gray-800 bg-gray-50/50 dark:bg-[#151924] text-sm text-gray-900 dark:text-gray-100">
                <MarkdownViewer content={content} className="text-sm"/>
            </div>
        </div>
    );
}

function ThoughtBubble({content}: { content: string }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="w-full">
            <button type="button" onClick={() => setExpanded((e) => !e)} className="w-full text-left group">
                <div className="flex items-center gap-1.5 mb-0.5">
                    <svg
                        className={`w-3 h-3 text-purple-400 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                    </svg>
                    <span className="text-[11px] font-medium text-purple-500 dark:text-purple-400 uppercase tracking-wide">
                        Thinking
                    </span>
                </div>
                <div
                    className={`px-3 py-2 rounded-lg bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-800/50 text-xs text-purple-700 dark:text-purple-300 whitespace-pre-wrap transition-all duration-150 ${
                        expanded ? "max-h-60 overflow-y-auto" : "max-h-[2.8em] overflow-hidden"
                    }`}
                >
                    {content}
                </div>
            </button>
        </div>
    );
}

/** Format raw input for inline display (truncated) */
function formatToolInputInline(rawInput?: Record<string, unknown>, maxLen = 60): string {
    if (!rawInput || Object.keys(rawInput).length === 0) return "";
    // For common tools, show the most relevant param
    const path = rawInput.file_path ?? rawInput.path ?? rawInput.file ?? rawInput.filePath;
    if (typeof path === "string") return path.length > maxLen ? `…${path.slice(-maxLen)}` : path;
    const cmd = rawInput.command;
    if (typeof cmd === "string") return cmd.length > maxLen ? `${cmd.slice(0, maxLen)}…` : cmd;
    const pattern = rawInput.pattern ?? rawInput.glob_pattern ?? rawInput.query;
    if (typeof pattern === "string") return pattern.length > maxLen ? `${pattern.slice(0, maxLen)}…` : pattern;
    const infoRequest = rawInput.information_request;
    if (typeof infoRequest === "string") return infoRequest.length > maxLen ? `${infoRequest.slice(0, maxLen)}…` : infoRequest;
    // Fallback: stringify first key-value
    const firstKey = Object.keys(rawInput)[0];
    const firstVal = rawInput[firstKey];
    const str = typeof firstVal === "string" ? firstVal : JSON.stringify(firstVal);
    return str.length > maxLen ? `${str.slice(0, maxLen)}…` : str;
}

/**
 * Check if a string looks like a file path (contains path separators or file extension).
 */
function looksLikeFilePath(str: string): boolean {
    if (!str) return false;
    // Check for path separators or file extensions
    return str.includes("/") || str.includes("\\") || /\.[a-z]{1,5}$/i.test(str);
}

/**
 * Check if a string is a generic/placeholder tool name that should trigger inference.
 */
function isGenericToolName(name: string | undefined): boolean {
    if (!name) return true;
    const genericNames = ["other", "tool", "unknown", "function", "action"];
    return genericNames.includes(name.toLowerCase());
}

/**
 * Try to infer tool name from input parameters.
 */
function inferFromInput(rawInput?: Record<string, unknown>): string | null {
    if (!rawInput) return null;

    const hasFilePath = "file_path" in rawInput || "path" in rawInput || "filePath" in rawInput;
    const hasContent = "content" in rawInput || "file_content" in rawInput;
    const hasCommand = "command" in rawInput;
    const hasInfoRequest = "information_request" in rawInput;
    const hasQuery = "query" in rawInput;
    const hasPattern = "pattern" in rawInput || "glob_pattern" in rawInput;
    const hasUrl = "url" in rawInput;
    const hasOldStr = "old_str" in rawInput || "old_str_1" in rawInput;
    const hasTerminalId = "terminal_id" in rawInput;
    const hasInsertLine = "insert_line" in rawInput || "insert_line_1" in rawInput;
    const hasViewRange = "view_range" in rawInput;

    if (hasInfoRequest) return "codebase-retrieval";
    if (hasOldStr && hasFilePath) return "str-replace-editor";
    if (hasInsertLine && hasFilePath) return "str-replace-editor";
    if (hasViewRange && hasFilePath) return "view";
    if (hasFilePath && hasContent) return "write-file";
    if (hasFilePath && !hasContent) return "read-file";
    if (hasTerminalId && hasCommand) return "launch-process";
    if (hasTerminalId) return "terminal";
    if (hasCommand) return "shell";
    if (hasUrl && hasQuery) return "web-search";
    if (hasUrl) return "web-fetch";
    if (hasPattern) return "glob";
    if (hasQuery) return "search";

    return null;
}

/**
 * Infer the actual tool name from the title, kind, and input parameters.
 * Handles cases where providers send file paths or generic names as the title.
 */
function inferToolName(
    title: string | undefined,
    kind: string | undefined,
    rawInput?: Record<string, unknown>
): string {
    // First, try to infer from input parameters (most reliable)
    const inferredFromInput = inferFromInput(rawInput);

    // If title looks like a file path, prefer inferred name
    if (title && looksLikeFilePath(title)) {
        return inferredFromInput ?? kind ?? "read-file";
    }

    // If title is a generic name, prefer inferred name
    if (isGenericToolName(title)) {
        if (inferredFromInput) return inferredFromInput;
        // If kind is also generic, still return inferred or fallback
        if (!isGenericToolName(kind)) return kind!;
        return inferredFromInput ?? "tool";
    }

    // Title looks like a valid specific tool name
    return title ?? inferredFromInput ?? kind ?? "tool";
}

/**
 * Normalize tool kind from any provider (Claude Code, OpenCode, etc.)
 * to a canonical kind used for icon/styling.
 */
function normalizeToolKind(kind?: string): string | undefined {
    if (!kind) return undefined;
    const k = kind.toLowerCase();
    // Shell / command execution
    if (k === "shell" || k === "bash" || k.includes("run_command") || k.includes("execute_command") || k.includes("run_terminal")) return "shell";
    // File read
    if (k === "read-file" || k === "read_file" || k === "ls" || k === "list_directory") return "read-file";
    // File write
    if (k === "write-file" || k === "write_file" || k === "create_file") return "write-file";
    // File edit
    if (k === "edit-file" || k === "edit_file" || k === "patch_file" || k === "str_replace") return "edit-file";
    // Glob / file search
    if (k === "glob" || k === "find_files" || k === "search_files" || k === "list_files") return "glob";
    // Grep / code search
    if (k === "grep" || k === "search_code" || k === "search_text" || k === "ripgrep") return "grep";
    // Web
    if (k === "web-search" || k === "web_search" || k === "search_web") return "web-search";
    if (k === "web-fetch" || k === "web_fetch" || k === "fetch_url" || k === "http_get") return "web-fetch";
    // Task / agent delegation
    if (k === "task" || k.includes("delegate_task") || k.includes("spawn_agent")) return "task";
    return kind;
}

/**
 * Get tool icon based on tool kind.
 * Returns an SVG path for different tool categories.
 */
function getToolIcon(kind?: string, toolName?: string): React.ReactNode {
    switch (normalizeToolKind(kind)) {
        // Shell/Bash - Terminal icon
        case "shell":
            return (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            );

        // Read file - Document icon
        case "read-file":
            return (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            );

        // Edit/Write file - Pencil icon
        case "edit-file":
        case "write-file":
            return (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
            );

        // Glob/Grep - Search icon
        case "glob":
        case "grep":
            return (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            );

        // Web operations - Globe icon
        case "web-fetch":
        case "web-search":
            return (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
            );

        // Default - show abbreviated tool name
        default:
            if (toolName) {
                const abbr = toolName.slice(0, 2).toUpperCase();
                return (
                    <span className="w-3 h-3 text-[8px] font-bold leading-none flex items-center justify-center">
                        {abbr}
                    </span>
                );
            }
            return (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            );
    }
}

/**
 * Get styling based on tool kind for visual distinction.
 */
function getToolStyling(kind?: string): { bgClass: string; borderClass: string; iconColorClass: string } {
    switch (normalizeToolKind(kind)) {
        case "shell":
            return {
                bgClass: "bg-slate-50 dark:bg-slate-900/30",
                borderClass: "border-slate-200 dark:border-slate-700/50",
                iconColorClass: "text-slate-600 dark:text-slate-400",
            };
        case "edit-file":
        case "write-file":
            return {
                bgClass: "bg-blue-50/50 dark:bg-blue-900/10",
                borderClass: "border-blue-200/50 dark:border-blue-800/30",
                iconColorClass: "text-blue-600 dark:text-blue-400",
            };
        case "read-file":
            return {
                bgClass: "bg-emerald-50/50 dark:bg-emerald-900/10",
                borderClass: "border-emerald-200/50 dark:border-emerald-800/30",
                iconColorClass: "text-emerald-600 dark:text-emerald-400",
            };
        case "glob":
        case "grep":
            return {
                bgClass: "bg-violet-50/50 dark:bg-violet-900/10",
                borderClass: "border-violet-200/50 dark:border-violet-800/30",
                iconColorClass: "text-violet-600 dark:text-violet-400",
            };
        case "web-fetch":
        case "web-search":
            return {
                bgClass: "bg-cyan-50/50 dark:bg-cyan-900/10",
                borderClass: "border-cyan-200/50 dark:border-cyan-800/30",
                iconColorClass: "text-cyan-600 dark:text-cyan-400",
            };
        default:
            return {
                bgClass: "bg-gray-50 dark:bg-[#161922]",
                borderClass: "border-gray-200/50 dark:border-gray-800/50",
                iconColorClass: "text-gray-500 dark:text-gray-400",
            };
    }
}

function extractOutputFromContent(content: string, toolName?: string): string {
    const outputMarker = "\n\nOutput:\n";
    const idx = content.indexOf(outputMarker);
    if (idx >= 0) return content.slice(idx + outputMarker.length);
    // Content is still input/streaming phase — no output yet
    if (content.includes("(streaming parameters...)")) return "";
    if (content.startsWith("Input:\n")) return "";
    if (content.includes("\n\nInput:\n")) return "";
    if (toolName && content.startsWith(toolName + "\n\n")) return "";
    return content;
}

function ToolBubble({
                        content, toolName, toolStatus, toolKind, rawInput,
                    }: {
    content: string; toolName?: string; toolStatus?: string; toolKind?: string; rawInput?: Record<string, unknown>;
}) {
    const [expanded, setExpanded] = useState(false);
    const statusColor =
        toolStatus === "completed" ? "bg-green-500"
            : toolStatus === "failed" ? "bg-red-500"
                : toolStatus === "in_progress" || toolStatus === "running" || toolStatus === "streaming" ? "bg-yellow-500 animate-pulse"
                    : "bg-gray-400";

    // Infer the actual tool name - handles cases where providers send file paths as title
    const displayName = inferToolName(toolName, toolKind, rawInput);
    // Use inferred name for kind normalization if toolKind is not set
    const effectiveKind = toolKind ?? displayName;

    const inputPreview = formatToolInputInline(rawInput);
    const styling = getToolStyling(effectiveKind);
    const icon = getToolIcon(effectiveKind, displayName);
    const hasInput = rawInput && Object.keys(rawInput).length > 0;
    const outputText = extractOutputFromContent(content, toolName);
    const hasOutput = !!outputText;

    return (
        <div className="flex flex-col w-full">
            <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className={`w-full px-2.5 py-1.5 rounded-md border ${styling.bgClass} ${styling.borderClass} flex items-center gap-2 text-left hover:brightness-95 dark:hover:brightness-110 transition-all`}
            >
                <span className={`shrink-0 ${styling.iconColorClass}`}>{icon}</span>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor}`}/>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate flex-1">
                    {displayName}
                </span>
                {inputPreview && (
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate max-w-[40%]">
                        {inputPreview}
                    </span>
                )}
                <svg
                    className={`w-2.5 h-2.5 text-gray-400 transition-transform duration-150 shrink-0 ${expanded ? "rotate-90" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
            </button>
            {expanded && (hasInput || hasOutput) && (
                <div className={`mt-1 ml-4 rounded-md border ${styling.bgClass} ${styling.borderClass} overflow-hidden`}>
                    {hasInput && (
                        <div className="px-2.5 py-2">
                            <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Input</div>
                            <CodeViewer
                                code={JSON.stringify(rawInput, null, 2)}
                                language="json"
                                maxHeight="200px"
                                showLineNumbers={false}
                                showCopyButton={false}
                                showHeader={false}
                                wordWrap={true}
                            />
                        </div>
                    )}
                    {hasInput && hasOutput && <div className={`border-t ${styling.borderClass}`}/>}
                    {hasOutput && (
                        <div className="px-2.5 py-2">
                            <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Output</div>
                            <div className="text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap max-h-48 overflow-y-auto">
                                {outputText}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export function AskUserQuestionBubble({
    message,
    onSubmit,
}: {
    message: ChatMessage;
    onSubmit?: (toolCallId: string, response: Record<string, unknown>) => Promise<void>;
}) {
    const rawInput = (message.toolRawInput ?? {}) as AskUserQuestionPayload;
    const questions = Array.isArray(rawInput.questions) ? rawInput.questions : [];
    const existingAnswers = rawInput.answers ?? {};
    const [answers, setAnswers] = useState<Record<string, string>>(existingAnswers);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    useEffect(() => {
        setAnswers(existingAnswers);
    }, [message.id, rawInput.answers]);

    const isCompleted = message.toolStatus === "completed";
    const isFailed = message.toolStatus === "failed";
    const isAwaitingInput = !isCompleted && !isFailed;

    const updateSingleAnswer = (question: string, answer: string) => {
        setAnswers((prev) => ({ ...prev, [question]: answer }));
    };

    const toggleMultiAnswer = (question: string, answer: string) => {
        setAnswers((prev) => {
            const current = prev[question]
                ? prev[question].split(",").map((item) => item.trim()).filter(Boolean)
                : [];
            const next = current.includes(answer)
                ? current.filter((item) => item !== answer)
                : [...current, answer];
            return { ...prev, [question]: next.join(", ") };
        });
    };

    const handleSubmit = async () => {
        if (!message.toolCallId || !onSubmit || submitting) return;

        for (const item of questions) {
            if (!answers[item.question]?.trim()) {
                setSubmitError(`Please answer \"${item.header}\" before continuing.`);
                return;
            }
        }

        setSubmitting(true);
        setSubmitError(null);
        try {
            await onSubmit(message.toolCallId, {
                questions,
                answers,
            });
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : "Failed to submit answers");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="w-full rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-950/20 overflow-hidden">
            <div className="px-3 py-2 border-b border-amber-200/70 dark:border-amber-800/40 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isCompleted ? "bg-green-500" : isFailed ? "bg-red-500" : "bg-amber-500 animate-pulse"}`} />
                <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">AskUserQuestion</span>
                <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                    {isCompleted ? "answered" : isFailed ? "failed" : "waiting for input"}
                </span>
            </div>
            <div className="px-3 py-3 space-y-4">
                {questions.map((item) => {
                    const selectedValues = answers[item.question]
                        ? answers[item.question].split(",").map((value) => value.trim()).filter(Boolean)
                        : [];
                    return (
                        <div key={item.question} className="space-y-2">
                            <div>
                                <div className="inline-flex items-center rounded-full bg-white/80 dark:bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                                    {item.header}
                                </div>
                                <div className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{item.question}</div>
                            </div>
                            <div className="grid gap-2">
                                {(item.options ?? []).map((option) => {
                                    const selected = selectedValues.includes(option.label);
                                    return (
                                        <button
                                            key={`${item.question}-${option.label}`}
                                            type="button"
                                            disabled={!isAwaitingInput || submitting}
                                            onClick={() => item.multiSelect
                                                ? toggleMultiAnswer(item.question, option.label)
                                                : updateSingleAnswer(item.question, option.label)}
                                            className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${selected
                                                ? "border-amber-500 bg-amber-100/80 dark:bg-amber-900/30"
                                                : "border-amber-200/80 dark:border-amber-800/40 bg-white/70 dark:bg-white/5 hover:border-amber-300 dark:hover:border-amber-700"
                                            } ${!isAwaitingInput ? "cursor-default" : ""}`}
                                        >
                                            <div className="flex items-start gap-2">
                                                <span className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${selected ? "border-amber-600 bg-amber-600 text-white" : "border-gray-300 dark:border-gray-600 text-transparent"}`}>
                                                    {item.multiSelect ? "✓" : "•"}
                                                </span>
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{option.label}</div>
                                                    {option.description && (
                                                        <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">{option.description}</div>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            {selectedValues.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {selectedValues.map((value) => (
                                        <span key={`${item.question}-${value}`} className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                                            {value}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}

                {submitError && (
                    <div className="rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                        {submitError}
                    </div>
                )}

                {isAwaitingInput && (
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={submitting || questions.length === 0}
                            className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {submitting ? "Submitting..." : "Submit answers"}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function TaskBubble({
                        content, toolStatus, rawInput,
                    }: {
    content: string; toolStatus?: string; rawInput?: Record<string, unknown>;
}) {
    const [expanded, setExpanded] = useState(true);
    const statusColor =
        toolStatus === "completed" ? "bg-green-500"
            : toolStatus === "failed" ? "bg-red-500"
                : toolStatus === "running" ? "bg-amber-500 animate-pulse"
                    : "bg-gray-400";
    const statusLabel =
        toolStatus === "completed" ? "done"
            : toolStatus === "failed" ? "failed"
                : toolStatus === "running" ? "running"
                    : "pending";

    // Extract task info from rawInput
    const description = (rawInput?.description as string) ?? "";
    const subagentType = (rawInput?.subagent_type as string) ?? "";
    const prompt = (rawInput?.prompt as string) ?? "";

    return (
        <div className="w-full">
            <div
                className="w-full rounded-lg border border-amber-200 dark:border-amber-800/50 overflow-hidden bg-amber-50/50 dark:bg-amber-900/10">
                <button
                    type="button"
                    onClick={() => setExpanded((e) => !e)}
                    className="w-full px-3 py-2 flex items-center gap-2 text-left"
                >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor}`}/>
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 shrink-0">
            Task{subagentType ? ` [${subagentType}]` : ""}
          </span>
                    {description && (
                        <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">
              {description}
            </span>
                    )}
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0">
            {statusLabel}
          </span>
                    <svg
                        className={`w-3 h-3 text-gray-400 transition-transform duration-150 shrink-0 ${expanded ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                    </svg>
                </button>
                {expanded && (prompt || content) && (
                    <div
                        className="px-3 py-2 border-t border-amber-200/50 dark:border-amber-800/30 text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {prompt || content}
                    </div>
                )}
            </div>
        </div>
    );
}

function PlanBubble({content, entries}: { content: string; entries?: PlanEntry[] }) {
    // Convert PlanEntry[] to TaskInfo[] for TaskProgressBar
    const tasks: TaskInfo[] = useMemo(() => {
        if (!entries || entries.length === 0) return [];
        return entries.map((entry, index) => ({
            id: `plan-${index}`,
            title: entry.content,
            status: entry.status === "completed" ? "completed"
                : entry.status === "in_progress" ? "running"
                : "pending",
            // Include priority as description suffix
            description: entry.priority ? `Priority: ${entry.priority}` : undefined,
        }));
    }, [entries]);

    // If we have structured entries, use TaskProgressBar
    if (entries && entries.length > 0) {
        return (
            <div className="w-full">
                <TaskProgressBar tasks={tasks} />
            </div>
        );
    }

    // Fallback for plain text plan content
    return (
        <div className="w-full">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#161922] overflow-hidden">
                <div className="px-3 py-2 flex items-center gap-2 bg-gray-100 dark:bg-[#1a1d2e] border-b border-gray-200 dark:border-gray-700">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Plan</span>
                </div>
                <div className="px-3 py-2">
                    <div className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{content}</div>
                </div>
            </div>
        </div>
    );
}

function UsageBadge({used, size, costAmount, costCurrency}: {
    used?: number;
    size?: number;
    costAmount?: number;
    costCurrency?: string
}) {
    if (used === undefined) return null;
    const pct = size ? Math.round((used / size) * 100) : 0;
    const formatTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

    // Determine color based on percentage
    const strokeColor = pct > 80 ? "#f87171" : pct > 50 ? "#fbbf24" : "#4ade80";

    // SVG circle parameters
    const radius = 16;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (pct / 100) * circumference;

    return (
        <div className="flex justify-center">
            <div
                className="relative group inline-flex items-center justify-center cursor-help"
                title={`${formatTokens(used)}${size ? ` / ${formatTokens(size)}` : ""} tokens${costAmount !== undefined && costAmount > 0 ? ` · $${costAmount.toFixed(4)} ${costCurrency ?? "USD"}` : ""}`}
            >
                {/* Circular progress indicator */}
                <svg width="40" height="40" className="transform -rotate-90">
                    {/* Background circle */}
                    <circle
                        cx="20"
                        cy="20"
                        r={radius}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        className="text-gray-200 dark:text-gray-700"
                    />
                    {/* Progress circle */}
                    {size && (
                        <circle
                            cx="20"
                            cy="20"
                            r={radius}
                            fill="none"
                            stroke={strokeColor}
                            strokeWidth="3"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            className="transition-all duration-300"
                        />
                    )}
                </svg>

                {/* Percentage text in center */}
                <span className="absolute text-[9px] font-semibold text-gray-600 dark:text-gray-300">
          {size ? `${pct}%` : formatTokens(used)}
        </span>

                {/* Tooltip on hover */}
                <div
                    className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <div
                        className="px-3 py-2 rounded-lg bg-gray-900 dark:bg-gray-800 text-white text-xs whitespace-nowrap shadow-lg border border-gray-700">
                        <div
                            className="font-medium">{formatTokens(used)}{size ? ` / ${formatTokens(size)}` : ""} tokens
                        </div>
                        {costAmount !== undefined && costAmount > 0 && (
                            <div className="text-gray-300 mt-0.5">${costAmount.toFixed(4)} {costCurrency ?? "USD"}</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function InfoBubble({content, rawData}: { content: string; rawData?: Record<string, unknown> }) {
    const [expanded, setExpanded] = useState(false);
    if (rawData) {
        return (
            <div className="flex justify-center my-1">
                <div className="max-w-xl w-full rounded-lg bg-gray-50 dark:bg-[#161922] border border-gray-100 dark:border-gray-800 text-[11px] text-gray-500 dark:text-gray-400 overflow-hidden">
                    <button
                        className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-[#1e2230] transition-colors text-left"
                        onClick={() => setExpanded(v => !v)}
                    >
                        <span className="opacity-60">{expanded ? "▾" : "▸"}</span>
                        <span className="font-mono">{content}</span>
                    </button>
                    {expanded && (
                        <pre className="px-3 pb-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-800">
                            {JSON.stringify(rawData, null, 2)}
                        </pre>
                    )}
                </div>
            </div>
        );
    }
    return (
        <div className="flex justify-center">
            <div
                className="px-3 py-1 rounded-full bg-gray-50 dark:bg-[#161922] border border-gray-100 dark:border-gray-800 text-[11px] text-gray-500 dark:text-gray-400">
                {content}
            </div>
        </div>
    );
}
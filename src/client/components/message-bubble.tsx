import React, {useState} from "react";
import {TerminalBubble} from "@/client/components/terminal/terminal-bubble";
import {ChatMessage, PlanEntry} from "@/client/components/chat-panel";
import {MarkdownViewer} from "@/client/components/markdown/markdown-viewer";

export function MessageBubble({message}: { message: ChatMessage }) {
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
            return <InfoBubble content={message.content}/>;
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
        <div className="flex justify-start">
            <div className="max-w-[90%] w-full">
                <button type="button" onClick={() => setExpanded((e) => !e)} className="w-full text-left group">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <svg
                            className={`w-3 h-3 text-purple-400 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                        </svg>
                        <span
                            className="text-[11px] font-medium text-purple-500 dark:text-purple-400 uppercase tracking-wide">
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
        </div>
    );
}

/** Format raw input for inline display (truncated) */
function formatToolInputInline(rawInput?: Record<string, unknown>, maxLen = 60): string {
    if (!rawInput || Object.keys(rawInput).length === 0) return "";
    // For common tools, show the most relevant param
    const path = rawInput.file_path ?? rawInput.path ?? rawInput.file;
    if (typeof path === "string") return path.length > maxLen ? `…${path.slice(-maxLen)}` : path;
    const cmd = rawInput.command;
    if (typeof cmd === "string") return cmd.length > maxLen ? `${cmd.slice(0, maxLen)}…` : cmd;
    const pattern = rawInput.pattern ?? rawInput.glob_pattern ?? rawInput.query;
    if (typeof pattern === "string") return pattern.length > maxLen ? `${pattern.slice(0, maxLen)}…` : pattern;
    // Fallback: stringify first key-value
    const firstKey = Object.keys(rawInput)[0];
    const firstVal = rawInput[firstKey];
    const str = typeof firstVal === "string" ? firstVal : JSON.stringify(firstVal);
    return str.length > maxLen ? `${str.slice(0, maxLen)}…` : str;
}

/**
 * Get tool icon based on tool kind.
 * Returns an SVG path for different tool categories.
 */
function getToolIcon(kind?: string, toolName?: string): React.ReactNode {
    switch (kind) {
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
    switch (kind) {
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
    if (toolName && content.startsWith(toolName + "\n\n")) return content.slice(toolName.length + 2);
    if (content.startsWith("Input:\n") || content.includes("(streaming parameters...)")) return "";
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

    const inputPreview = formatToolInputInline(rawInput);
    const styling = getToolStyling(toolKind);
    const icon = getToolIcon(toolKind, toolName);
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
                    {toolName ?? "tool"}
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
                            <pre className="text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap max-h-32 overflow-y-auto">
                                {JSON.stringify(rawInput, null, 2)}
                            </pre>
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
    const [expanded, setExpanded] = useState(true);
    const statusIcon = (s?: string) => {
        switch (s) {
            case "completed":
                return "\u2713";
            case "in_progress":
                return "\u25CF";
            default:
                return "\u25CB";
        }
    };
    const priorityColor = (p?: string) => {
        switch (p) {
            case "high":
                return "text-red-500";
            case "medium":
                return "text-yellow-500";
            default:
                return "text-gray-400";
        }
    };

    return (
        <div className="flex justify-start">
            <div className="max-w-[90%] rounded-lg border border-indigo-100 dark:border-indigo-900/50 overflow-hidden">
                <button
                    type="button"
                    onClick={() => setExpanded((e) => !e)}
                    className="w-full px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/10 border-b border-indigo-100 dark:border-indigo-900/50 flex items-center gap-2 text-left"
                >
                    <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Plan</span>
                    <svg
                        className={`w-3 h-3 text-indigo-400 transition-transform duration-150 ml-auto ${expanded ? "rotate-90" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                    </svg>
                </button>
                {expanded && (
                    <div className="px-3 py-2 bg-white dark:bg-[#0f1117]">
                        {entries ? (
                            <div className="space-y-1">
                                {entries.map((e, i) => (
                                    <div key={i} className="flex items-start gap-2 text-xs">
                    <span
                        className={`shrink-0 ${e.status === "completed" ? "text-green-500" : e.status === "in_progress" ? "text-blue-500" : "text-gray-400"}`}>
                      {statusIcon(e.status)}
                    </span>
                                        <span className="text-gray-700 dark:text-gray-300">{e.content}</span>
                                        {e.priority && (
                                            <span
                                                className={`ml-auto shrink-0 text-[10px] ${priorityColor(e.priority)}`}>{e.priority}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div
                                className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{content}</div>
                        )}
                    </div>
                )}
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

function InfoBubble({content}: { content: string }) {
    return (
        <div className="flex justify-center">
            <div
                className="px-3 py-1 rounded-full bg-gray-50 dark:bg-[#161922] border border-gray-100 dark:border-gray-800 text-[11px] text-gray-500 dark:text-gray-400">
                {content}
            </div>
        </div>
    );
}
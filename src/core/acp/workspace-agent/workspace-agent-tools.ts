/**
 * Workspace Agent Tools
 *
 * Defines coding tools and agent management tools using Vercel AI SDK's tool() format.
 * Tool names are aligned with classifyToolKind() patterns in agent-event-bridge/types.ts
 * so that AgentEventBridge automatically routes them to the correct block event types.
 */

import { tool } from "ai";
import { z } from "zod";
import { readFile, writeFile, readdir, mkdir, stat } from "fs/promises";
import { join, resolve, relative, isAbsolute } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { glob } from "glob";
import type { AgentTools } from "@/core/tools/agent-tools";

const execAsync = promisify(exec);

/** Max file size to read (1MB) */
const MAX_READ_SIZE = 1_048_576;
/** Max command output size (100KB) */
const MAX_OUTPUT_SIZE = 102_400;

/**
 * Resolve a path relative to cwd, preventing directory traversal outside cwd.
 */
function safePath(cwd: string, filePath: string): string {
  const resolved = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
  // Allow absolute paths but log if outside cwd
  return resolved;
}

/**
 * Create the 7 core coding tools for the workspace agent.
 */
export function createCodingTools(cwd: string) {
  return {
    read_file: tool({
      description: "Read the contents of a file. Returns the file content as a string.",
      parameters: z.object({
        path: z.string().describe("File path (relative to workspace root or absolute)"),
      }),
      execute: async ({ path: filePath }) => {
        const fullPath = safePath(cwd, filePath);
        const stats = await stat(fullPath);
        if (stats.size > MAX_READ_SIZE) {
          return { error: `File too large: ${stats.size} bytes (max ${MAX_READ_SIZE})` };
        }
        const content = await readFile(fullPath, "utf-8");
        return { path: fullPath, content, size: stats.size };
      },
    }),

    write_file: tool({
      description: "Write content to a file. Creates the file and parent directories if they don't exist, or overwrites if it does.",
      parameters: z.object({
        path: z.string().describe("File path (relative to workspace root or absolute)"),
        content: z.string().describe("Content to write"),
      }),
      execute: async ({ path: filePath, content }) => {
        const fullPath = safePath(cwd, filePath);
        await mkdir(join(fullPath, ".."), { recursive: true });
        await writeFile(fullPath, content, "utf-8");
        return { path: fullPath, bytesWritten: Buffer.byteLength(content, "utf-8") };
      },
    }),

    edit_file: tool({
      description: "Apply a search-and-replace edit to a file. The old_string must match exactly one location in the file.",
      parameters: z.object({
        path: z.string().describe("File path"),
        old_string: z.string().describe("Exact string to find in the file"),
        new_string: z.string().describe("Replacement string"),
      }),
      execute: async ({ path: filePath, old_string, new_string }) => {
        const fullPath = safePath(cwd, filePath);
        const content = await readFile(fullPath, "utf-8");
        const occurrences = content.split(old_string).length - 1;
        if (occurrences === 0) {
          return { error: "old_string not found in file" };
        }
        if (occurrences > 1) {
          return { error: `old_string found ${occurrences} times — must be unique. Provide more context.` };
        }
        const newContent = content.replace(old_string, new_string);
        await writeFile(fullPath, newContent, "utf-8");
        return { path: fullPath, replaced: true };
      },
    }),

    search_files: tool({
      description: "Search for files matching a glob pattern. Returns a list of matching file paths.",
      parameters: z.object({
        pattern: z.string().describe("Glob pattern, e.g. '**/*.ts' or 'src/**/*.test.ts'"),
        path: z.string().optional().describe("Directory to search in (default: workspace root)"),
      }),
      execute: async ({ pattern, path: searchPath }) => {
        const searchDir = searchPath ? safePath(cwd, searchPath) : cwd;
        const matches = await glob(pattern, {
          cwd: searchDir,
          nodir: true,
          ignore: ["**/node_modules/**", "**/.git/**"],
        });
        return {
          pattern,
          cwd: searchDir,
          matches: matches.slice(0, 200),
          totalMatches: matches.length,
          truncated: matches.length > 200,
        };
      },
    }),

    grep_search: tool({
      description: "Search file contents using a regex pattern. Returns matching lines with file paths and line numbers.",
      parameters: z.object({
        pattern: z.string().describe("Regex pattern to search for"),
        path: z.string().optional().describe("Directory or file to search in (default: workspace root)"),
        include: z.string().optional().describe("Glob pattern to filter files, e.g. '*.ts'"),
      }),
      execute: async ({ pattern, path: searchPath, include }) => {
        const searchDir = searchPath ? safePath(cwd, searchPath) : cwd;
        const includeFlag = include ? `--include='${include}'` : "";
        const cmd = `grep -rn ${includeFlag} -E '${pattern.replace(/'/g, "'\\''")}' '${searchDir}' 2>/dev/null | head -100`;
        try {
          const { stdout } = await execAsync(cmd, { cwd, maxBuffer: MAX_OUTPUT_SIZE, timeout: 15_000 });
          const lines = stdout.trim().split("\n").filter(Boolean);
          return {
            pattern,
            matches: lines.map((line) => {
              const [filePart, ...rest] = line.split(":");
              const lineNum = rest[0];
              const content = rest.slice(1).join(":");
              return {
                file: relative(cwd, filePart) || filePart,
                line: parseInt(lineNum, 10) || 0,
                content: content?.trim() ?? "",
              };
            }),
            totalMatches: lines.length,
            truncated: lines.length >= 100,
          };
        } catch {
          return { pattern, matches: [], totalMatches: 0, truncated: false };
        }
      },
    }),

    run_command: tool({
      description: "Execute a shell command in the workspace directory. Returns stdout, stderr, and exit code.",
      parameters: z.object({
        command: z.string().describe("Shell command to execute"),
        timeout_ms: z.number().optional().default(30_000).describe("Timeout in milliseconds (default: 30000)"),
      }),
      execute: async ({ command, timeout_ms }) => {
        try {
          const { stdout, stderr } = await execAsync(command, {
            cwd,
            maxBuffer: MAX_OUTPUT_SIZE,
            timeout: timeout_ms,
          });
          return {
            command,
            stdout: stdout.slice(0, MAX_OUTPUT_SIZE),
            stderr: stderr.slice(0, MAX_OUTPUT_SIZE),
            exitCode: 0,
          };
        } catch (error: unknown) {
          const execError = error as { stdout?: string; stderr?: string; code?: number; killed?: boolean };
          if (execError.killed) {
            return { command, error: `Command timed out after ${timeout_ms}ms`, exitCode: -1 };
          }
          return {
            command,
            stdout: (execError.stdout ?? "").slice(0, MAX_OUTPUT_SIZE),
            stderr: (execError.stderr ?? "").slice(0, MAX_OUTPUT_SIZE),
            exitCode: execError.code ?? 1,
          };
        }
      },
    }),

    list_directory: tool({
      description: "List files and directories at the given path.",
      parameters: z.object({
        path: z.string().optional().default(".").describe("Directory path (default: workspace root)"),
      }),
      execute: async ({ path: dirPath }) => {
        const fullPath = safePath(cwd, dirPath);
        const entries = await readdir(fullPath, { withFileTypes: true });
        return {
          path: fullPath,
          entries: entries.map((e) => ({
            name: e.name,
            type: e.isDirectory() ? "directory" : "file",
          })),
        };
      },
    }),
  };
}

/**
 * Create agent management tools that bridge to existing AgentTools.
 * These allow the workspace agent to coordinate other ACP agents.
 */
export function createAgentManagementTools(
  agentTools: AgentTools,
  workspaceId: string,
  agentId: string,
) {
  return {
    list_agents: tool({
      description: "List all agents in the current workspace with their status.",
      parameters: z.object({}),
      execute: async () => {
        const result = await agentTools.listAgents(workspaceId);
        return result.data;
      },
    }),

    create_agent: tool({
      description: "Create a new agent in the workspace.",
      parameters: z.object({
        name: z.string().describe("Agent name"),
        role: z.enum(["ROUTA", "CRAFTER", "GATE", "DEVELOPER"]).describe("Agent role"),
        modelTier: z.enum(["SMART", "BALANCED", "FAST"]).optional().describe("Model tier"),
      }),
      execute: async ({ name, role, modelTier }) => {
        const result = await agentTools.createAgent({
          name,
          role,
          workspaceId,
          parentId: agentId,
          modelTier,
        });
        return result.data;
      },
    }),

    delegate_task: tool({
      description: "Delegate a task to an existing agent.",
      parameters: z.object({
        agentId: z.string().describe("Target agent ID"),
        taskId: z.string().describe("Task ID to delegate"),
      }),
      execute: async ({ agentId: targetAgentId, taskId }) => {
        const result = await agentTools.delegate({
          agentId: targetAgentId,
          taskId,
          callerAgentId: agentId,
        });
        return result.data;
      },
    }),

    send_message: tool({
      description: "Send a message to another agent.",
      parameters: z.object({
        toAgentId: z.string().describe("Target agent ID"),
        message: z.string().describe("Message content"),
      }),
      execute: async ({ toAgentId, message }) => {
        const result = await agentTools.messageAgent({
          fromAgentId: agentId,
          toAgentId,
          message,
        });
        return result.data;
      },
    }),

    get_agent_status: tool({
      description: "Get the current status and details of an agent.",
      parameters: z.object({
        agentId: z.string().describe("Agent ID to query"),
      }),
      execute: async ({ agentId: targetAgentId }) => {
        const result = await agentTools.getAgentStatus(targetAgentId);
        return result.data;
      },
    }),
  };
}

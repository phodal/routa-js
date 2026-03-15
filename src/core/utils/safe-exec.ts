/**
 * Safe Command Execution Utilities
 *
 * Provides sanitized wrappers around child_process to prevent command injection.
 * All user-controlled input is passed as separate arguments, never interpolated into shell strings.
 */

import { execFileSync, spawn, type SpawnOptions } from "child_process";

/**
 * Validate that a string contains only safe characters for use in commands.
 * Allows: alphanumeric, dash, underscore, dot, forward slash, colon
 */
export function isSafeString(value: string): boolean {
  return /^[a-zA-Z0-9\-_./: ]+$/.test(value);
}

/**
 * Validate a Git URL to prevent command injection via ext:: protocol.
 * Git allows shell commands in ext URLs like: ext::sh -c whoami% >&2
 * 
 * @param url - The Git URL to validate
 * @returns true if the URL is safe, false otherwise
 */
export function isValidGitUrl(url: string): boolean {
  if (!url || /[\0\r\n]/.test(url) || /\s/.test(url)) {
    return false;
  }

  // Reject ext:: protocol which allows arbitrary command execution
  if (url.toLowerCase().startsWith("ext::")) {
    return false;
  }
  
  // Allow common Git protocols
  const validProtocols = /^(https?|git|ssh|file):\/\//i;
  const isScpStyle = /^[^@\s]+@[^:\s]+:[^\s]+$/;
  const isAbsolutePath = /^[/~]/; // Unix absolute paths
  const isWindowsPath = /^[a-zA-Z]:\\/; // Windows paths
  
  return (
    validProtocols.test(url) ||
    isScpStyle.test(url) ||
    isAbsolutePath.test(url) ||
    isWindowsPath.test(url)
  );
}

/**
 * Sanitize a string for safe use in shell commands by escaping special characters.
 * This is a defense-in-depth measure - prefer passing arguments separately.
 */
export function sanitizeShellArg(arg: string): string {
  // Escape special shell characters
  return arg.replace(/(["\s'$`\\!])/g, "\\$1");
}

/**
 * Execute a command safely with separate arguments (no shell interpolation).
 * @param command - The command to execute (e.g., "gh", "git")
 * @param args - Array of arguments to pass to the command
 * @param options - Execution options
 * @returns Command output as string
 */
export function safeExecSync(
  command: string,
  args: string[],
  options?: { cwd?: string; encoding?: BufferEncoding }
): string {
  const output = execFileSync(command, args, {
    encoding: options?.encoding ?? "utf-8",
    cwd: options?.cwd ?? process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  });

  return typeof output === "string" ? output : output.toString();
}

/**
 * Spawn a process safely with separate arguments (no shell interpolation).
 * @param command - The command to execute
 * @param args - Array of arguments
 * @param options - Spawn options
 */
export function safeSpawn(
  command: string,
  args: string[],
  options?: SpawnOptions
) {
  // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process
  // Centralized process wrapper. Callers must validate command/args and shell stays disabled.
  return spawn(command, args, {
    ...options,
    shell: false, // Never use shell to prevent injection
  });
}

/**
 * Execute gh CLI command safely.
 * @param args - Arguments to pass to gh command
 * @param options - Execution options
 */
export function ghExec(args: string[], options?: { cwd?: string }): string {
  return safeExecSync("gh", args, options);
}

/**
 * Execute git command safely.
 * @param args - Arguments to pass to git command
 * @param options - Execution options
 */
export function gitExec(args: string[], options?: { cwd?: string }): string {
  return safeExecSync("git", args, options);
}

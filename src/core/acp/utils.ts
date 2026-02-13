/**
 * ACP Utility functions
 */

import { execFile } from "child_process";

/**
 * Find an executable in PATH (like Unix `which`).
 * Returns the resolved path if found, null otherwise.
 */
export async function which(command: string): Promise<string | null> {
  // If command is already an absolute path, check if it exists
  if (command.startsWith("/") || command.startsWith("\\")) {
    try {
      const fs = await import("fs");
      const stat = fs.statSync(command);
      if (stat.isFile()) return command;
    } catch {
      return null;
    }
  }

  const isWindows = process.platform === "win32";
  const checkCmd = isWindows ? "where" : "which";

  return new Promise((resolve) => {
    execFile(checkCmd, [command], (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve(null);
      } else {
        // On Windows, `where` may return multiple lines; take the first
        resolve(stdout.trim().split("\n")[0].trim());
      }
    });
  });
}

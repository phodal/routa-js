/**
 * TraceWriter - Append-only JSONL file writer for trace records.
 *
 * Writes traces to: <workspace>/.routa/traces/{day}/traces-{datetime}.jsonl
 *
 * In serverless environments (Vercel), traces are written to /tmp/.routa/traces/
 * since the main filesystem is read-only.
 */

import { TraceRecord } from "./types";
import path from "path";
import fs from "fs/promises";

/**
 * Check if running in a serverless environment (e.g., Vercel)
 */
function isServerlessEnvironment(): boolean {
  return !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/**
 * Format a date as YYYY-MM-DD for daily directory names.
 */
function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Format a date as YYYYMMDD-HHmmss for file names.
 */
function formatDateTime(date: Date): string {
  return date.toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 15);
}

/**
 * TraceWriter manages JSONL trace file writing with automatic directory creation
 * and daily file rotation.
 *
 * In serverless environments, traces are written to /tmp which is the only writable
 * directory. Note that /tmp contents are ephemeral and may be cleared between invocations.
 */
export class TraceWriter {
  private cwd: string;
  private currentDay: string | null = null;
  private currentFilePath: string | null = null;
  private readonly isServerless: boolean;

  constructor(cwd: string) {
    this.cwd = cwd;
    this.isServerless = isServerlessEnvironment();
  }

  /**
   * Get the trace directory path for a given day.
   * In serverless environments, uses /tmp/.routa/traces/ instead of workspace.
   */
  private getTraceDir(day: string): string {
    const basePath = this.isServerless ? "/tmp" : this.cwd;
    return path.join(basePath, ".routa", "traces", day);
  }

  /**
   * Get a new trace file path for the current datetime.
   */
  private async getTracePath(day: string): Promise<string> {
    const dir = this.getTraceDir(day);
    
    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });
    
    // If we have a current file for this day, reuse it
    if (this.currentDay === day && this.currentFilePath) {
      return this.currentFilePath;
    }
    
    // Create new file path
    const datetime = formatDateTime(new Date());
    const filePath = path.join(dir, `traces-${datetime}.jsonl`);
    
    this.currentDay = day;
    this.currentFilePath = filePath;
    
    return filePath;
  }

  /**
   * Append a trace record to the current trace file.
   */
  async append(record: TraceRecord): Promise<void> {
    const day = formatDay(new Date());
    const filePath = await this.getTracePath(day);
    
    const line = JSON.stringify(record) + "\n";
    await fs.appendFile(filePath, line, "utf-8");
  }

  /**
   * Append a trace record safely - logs errors but never throws.
   * Use this in hot paths where trace failures should not impact main flow.
   */
  async appendSafe(record: TraceRecord): Promise<void> {
    try {
      await this.append(record);
    } catch (err) {
      console.error("[TraceWriter] Failed to append trace:", err);
    }
  }
}

// ─── Singleton Instance ───────────────────────────────────────────────────

const GLOBAL_KEY = "__trace_writers__";

type TraceWriterCache = Map<string, TraceWriter>;

function getWriterCache(): TraceWriterCache {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new Map<string, TraceWriter>();
  }
  return g[GLOBAL_KEY] as TraceWriterCache;
}

/**
 * Get or create a TraceWriter for the given cwd.
 */
export function getTraceWriter(cwd: string): TraceWriter {
  const cache = getWriterCache();
  let writer = cache.get(cwd);
  if (!writer) {
    writer = new TraceWriter(cwd);
    cache.set(cwd, writer);
  }
  return writer;
}

/**
 * Create trace records and append them in one call.
 */
export async function recordTrace(
  cwd: string,
  record: TraceRecord
): Promise<void> {
  const writer = getTraceWriter(cwd);
  await writer.appendSafe(record);
}


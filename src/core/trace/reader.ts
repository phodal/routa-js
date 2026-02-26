/**
 * TraceReader — Query and read trace records from filesystem storage.
 *
 * Storage path: `<workspace>/.routa/traces/{day}/traces-{datetime}.jsonl`
 *
 * In serverless environments (Vercel), reads from /tmp/.routa/traces/
 * since that's where TraceWriter stores traces.
 *
 * Features:
 * - Filter traces by session, file, workspace, date range
 * - Retrieve individual traces by ID
 * - Export traces in standard Agent Trace JSON format
 * - Efficient file scanning with early termination on match
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { TraceRecord, TraceEventType } from "./types";

/**
 * Check if running in a serverless environment (e.g., Vercel)
 */
function isServerlessEnvironment(): boolean {
  return !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/**
 * Query parameters for filtering traces.
 */
export interface TraceQuery {
  /** Filter by session ID */
  sessionId?: string;
  /** Filter by workspace ID */
  workspaceId?: string;
  /** Filter by file path */
  file?: string;
  /** Filter by event type */
  eventType?: TraceEventType;
  /** Start date (YYYY-MM-DD or ISO 8601) */
  startDate?: string;
  /** End date (YYYY-MM-DD or ISO 8601) */
  endDate?: string;
  /** Maximum number of traces to return */
  limit?: number;
  /** Skip N traces (for pagination) */
  offset?: number;
}

/**
 * Trace statistics for a workspace.
 */
export interface TraceStats {
  totalDays: number;
  totalFiles: number;
  totalRecords: number;
  uniqueSessions: number;
  eventTypes: Record<string, number>;
}

/**
 * TraceReader provides querying capabilities over stored traces.
 *
 * In serverless environments, reads from /tmp/.routa/traces/ since
 * that's the only writable location.
 */
export class TraceReader {
  /** Base directory for trace files (e.g., "/project/.routa/traces") */
  readonly #baseDir: string;

  /**
   * Create a new TraceReader with the given workspace root.
   *
   * Traces are read from `<workspace_root>/.routa/traces/`.
   * In serverless environments, reads from `/tmp/.routa/traces/`.
   */
  constructor(workspaceRoot: string) {
    const basePath = isServerlessEnvironment() ? "/tmp" : workspaceRoot;
    this.#baseDir = path.join(basePath, ".routa", "traces");
  }

  /**
   * Create a TraceReader with a custom base directory.
   */
  static withBaseDir(baseDir: string): TraceReader {
    return new TraceReader(baseDir.replace(/\.routa\/traces$/, ""));
  }

  /**
   * Query traces based on the provided filter parameters.
   *
   * Returns traces sorted by timestamp (newest first).
   */
  async query(query: TraceQuery = {}): Promise<TraceRecord[]> {
    // If traces directory doesn't exist, return empty result
    try {
      await fs.access(this.#baseDir);
    } catch {
      return [];
    }

    const traces: TraceRecord[] = [];

    // Get all day directories
    const dayDirs = await this.#listDayDirs();

    // Apply date filtering if specified
    const filteredDays = this.#filterDaysByDate(dayDirs, query);

    // Read traces from each day directory
    for (const dayDir of filteredDays) {
      const traceFiles = await this.#listTraceFiles(dayDir);

      for (const traceFile of traceFiles) {
        const content = await fs.readFile(traceFile, "utf-8");

        for (const line of content.split("\n").filter(Boolean)) {
          try {
            const record: TraceRecord = JSON.parse(line);
            if (this.#matchesQuery(record, query)) {
              traces.push(record);
            }
          } catch {
            // Skip invalid lines
          }
        }

        // Early termination if we have enough results
        const needed = (query.limit ?? Infinity) + (query.offset ?? 0);
        if (traces.length >= needed) {
          break;
        }
      }
    }

    // Sort by timestamp (oldest first for chronological reading) and apply pagination
    traces.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const offset = query.offset ?? 0;
    const limit = query.limit ?? traces.length;

    return traces.slice(offset, offset + limit);
  }

  /**
   * Get a single trace by its ID.
   */
  async getById(id: string): Promise<TraceRecord | null> {
    try {
      await fs.access(this.#baseDir);
    } catch {
      return null;
    }

    const dayDirs = await this.#listDayDirs();

    for (const dayDir of dayDirs) {
      const traceFiles = await this.#listTraceFiles(dayDir);

      for (const traceFile of traceFiles) {
        const content = await fs.readFile(traceFile, "utf-8");

        for (const line of content.split("\n").filter(Boolean)) {
          try {
            const record: TraceRecord = JSON.parse(line);
            if (record.id === id) {
              return record;
            }
          } catch {
            // Skip invalid lines
          }
        }
      }
    }

    return null;
  }

  /**
   * Export traces matching the query in Agent Trace JSON format.
   *
   * Returns a JSON array of trace records.
   */
  async export(query: TraceQuery = {}): Promise<unknown> {
    const traces = await this.query(query);
    return traces;
  }

  /**
   * Get trace statistics for a workspace.
   */
  async stats(): Promise<TraceStats> {
    const defaultStats: TraceStats = {
      totalDays: 0,
      totalFiles: 0,
      totalRecords: 0,
      uniqueSessions: 0,
      eventTypes: {},
    };

    try {
      await fs.access(this.#baseDir);
    } catch {
      return defaultStats;
    }

    const stats: TraceStats = { ...defaultStats, eventTypes: {} };
    const sessions = new Set<string>();

    const dayDirs = await this.#listDayDirs();
    stats.totalDays = dayDirs.length;

    for (const dayDir of dayDirs) {
      const traceFiles = await this.#listTraceFiles(dayDir);
      stats.totalFiles += traceFiles.length;

      for (const traceFile of traceFiles) {
        const content = await fs.readFile(traceFile, "utf-8");
        const lines = content.split("\n").filter(Boolean);
        stats.totalRecords += lines.length;

        for (const line of lines) {
          try {
            const record: TraceRecord = JSON.parse(line);
            sessions.add(record.sessionId);
            stats.eventTypes[record.eventType] =
              (stats.eventTypes[record.eventType] ?? 0) + 1;
          } catch {
            // Skip invalid lines
          }
        }
      }
    }

    stats.uniqueSessions = sessions.size;
    return stats;
  }

  /**
   * List all day directories sorted newest first.
   */
  async #listDayDirs(): Promise<string[]> {
    const entries = await fs.readdir(this.#baseDir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => path.join(this.#baseDir, e.name));
    return dirs.sort().reverse();
  }

  /**
   * List all trace files in a day directory sorted by name.
   */
  async #listTraceFiles(dayDir: string): Promise<string[]> {
    const entries = await fs.readdir(dayDir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && e.name.endsWith(".jsonl"))
      .map((e) => path.join(dayDir, e.name));
    return files.sort().reverse();
  }

  /**
   * Filter day directories by date range.
   */
  #filterDaysByDate(dayDirs: string[], query: TraceQuery): string[] {
    const filtered: string[] = [];

    for (const dayDir of dayDirs) {
      const dayName = path.basename(dayDir);

      if (!this.#isValidDateFormat(dayName)) {
        continue;
      }

      if (query.startDate && dayName < query.startDate) {
        continue;
      }

      if (query.endDate && dayName > query.endDate) {
        continue;
      }

      filtered.push(dayDir);
    }

    return filtered;
  }

  /**
   * Check if a date string is valid YYYY-MM-DD format.
   */
  #isValidDateFormat(dateStr: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  }

  /**
   * Check if a trace record matches the query parameters.
   */
  #matchesQuery(record: TraceRecord, query: TraceQuery): boolean {
    if (query.sessionId && record.sessionId !== query.sessionId) {
      return false;
    }

    if (query.workspaceId && record.workspaceId !== query.workspaceId) {
      return false;
    }

    if (query.file) {
      const fileMatches = record.files?.some((f) => f.path === query.file) ?? false;
      if (!fileMatches) {
        return false;
      }
    }

    if (query.eventType && record.eventType !== query.eventType) {
      return false;
    }

    return true;
  }
}

// ─── Singleton Instance ───────────────────────────────────────────────────

const GLOBAL_KEY = "__trace_readers__";

type TraceReaderCache = Map<string, TraceReader>;

function getReaderCache(): TraceReaderCache {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new Map<string, TraceReader>();
  }
  return g[GLOBAL_KEY] as TraceReaderCache;
}

/**
 * Get or create a TraceReader for the given cwd.
 */
export function getTraceReader(cwd: string): TraceReader {
  const cache = getReaderCache();
  let reader = cache.get(cwd);
  if (!reader) {
    reader = new TraceReader(cwd);
    cache.set(cwd, reader);
  }
  return reader;
}

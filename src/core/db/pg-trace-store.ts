/**
 * PgTraceStore — Postgres-backed trace store using Drizzle ORM.
 *
 * Used in serverless environments (Vercel) where the filesystem is ephemeral.
 * Traces are stored in the `traces` table and queried with the same interface
 * as the filesystem-based TraceReader.
 */

import { eq, desc, and, gte, lte, type SQL } from "drizzle-orm";
import type { Database } from "./index";
import { traces } from "./schema";
import type { TraceRecord } from "../trace/types";
import type { TraceQuery } from "../trace/reader";

export class PgTraceStore {
  constructor(private db: Database) {}

  async save(record: TraceRecord): Promise<void> {
    await this.db
      .insert(traces)
      .values({
        id: record.id,
        sessionId: record.sessionId,
        workspaceId: record.workspaceId,
        eventType: record.eventType,
        version: record.version,
        contributor: record.contributor as unknown as Record<string, unknown>,
        tool: record.tool as unknown as Record<string, unknown> | undefined,
        files: record.files as unknown[] | undefined,
        conversation: record.conversation as Record<string, unknown> | undefined,
        vcs: record.vcs as Record<string, unknown> | undefined,
        metadata: record.metadata,
        timestamp: new Date(record.timestamp),
      })
      .onConflictDoNothing();
  }

  async query(query: TraceQuery): Promise<TraceRecord[]> {
    const conditions: SQL[] = [];

    if (query.sessionId) {
      conditions.push(eq(traces.sessionId, query.sessionId));
    }
    if (query.workspaceId) {
      conditions.push(eq(traces.workspaceId, query.workspaceId));
    }
    if (query.eventType) {
      conditions.push(eq(traces.eventType, query.eventType));
    }
    if (query.startDate) {
      conditions.push(gte(traces.timestamp, new Date(query.startDate)));
    }
    if (query.endDate) {
      // Include the full end day
      const end = new Date(query.endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(lte(traces.timestamp, end));
    }

    const limit = query.limit ?? 500;
    const offset = query.offset ?? 0;

    const rows = await this.db
      .select()
      .from(traces)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(traces.timestamp))
      .limit(limit)
      .offset(offset);

    // Return oldest-first (consistent with filesystem reader)
    return rows.reverse().map(this.toModel);
  }

  async getById(id: string): Promise<TraceRecord | null> {
    const rows = await this.db
      .select()
      .from(traces)
      .where(eq(traces.id, id))
      .limit(1);
    return rows[0] ? this.toModel(rows[0]) : null;
  }

  private toModel(row: typeof traces.$inferSelect): TraceRecord {
    return {
      version: row.version,
      id: row.id,
      timestamp: row.timestamp.toISOString(),
      sessionId: row.sessionId,
      workspaceId: row.workspaceId ?? undefined,
      eventType: row.eventType as TraceRecord["eventType"],
      contributor: row.contributor as unknown as TraceRecord["contributor"],
      tool: row.tool as unknown as TraceRecord["tool"],
      files: row.files as TraceRecord["files"],
      conversation: row.conversation as unknown as TraceRecord["conversation"],
      vcs: row.vcs as unknown as TraceRecord["vcs"],
      metadata: row.metadata as TraceRecord["metadata"],
    };
  }
}

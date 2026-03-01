#!/usr/bin/env tsx
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const r = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='schedules'`;
  console.log("schedules exists:", r.length > 0);
  const idx = await sql`SELECT indexname FROM pg_indexes WHERE tablename='schedules'`;
  console.log("indexes:", idx.map((x: any) => x.indexname).join(", "));
  if (r.length > 0 && idx.length < 3) {
    await sql`CREATE INDEX IF NOT EXISTS "schedules_workspace_idx" ON "schedules" ("workspace_id")`;
    await sql`CREATE INDEX IF NOT EXISTS "schedules_enabled_next_run_idx" ON "schedules" ("enabled", "next_run_at")`;
    console.log("missing indexes applied");
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });

/**
 * SchedulerService — in-process cron scheduler for local development.
 *
 * Uses node-cron to tick every minute and call the /api/schedules/tick endpoint.
 * Only active in non-Vercel environments (NODE_ENV !== "production" or ROUTA_DB_DRIVER === "sqlite").
 *
 * In production on Vercel, the tick is handled by Vercel Cron Jobs instead.
 */

import nodeCron from "node-cron";
import type { ScheduledTask } from "node-cron";

let schedulerTask: ScheduledTask | null = null;
let isStarted = false;

const TICK_URL =
  process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/schedules/tick`
    : "http://localhost:3000/api/schedules/tick";

export function startSchedulerService(): void {
  if (isStarted) return;

  // Only start in-process scheduler outside Vercel production
  const isVercelProduction =
    process.env.VERCEL === "1" && process.env.NODE_ENV === "production";
  if (isVercelProduction) {
    console.log("[Scheduler] Skipping in-process scheduler (Vercel handles crons)");
    return;
  }

  console.log("[Scheduler] Starting in-process cron scheduler (every minute)");

  schedulerTask = nodeCron.schedule("* * * * *", async () => {
    try {
      const resp = await fetch(TICK_URL, { method: "POST" });
      if (!resp.ok) {
        console.error("[Scheduler] Tick failed:", resp.status, await resp.text());
        return;
      }
      const data = await resp.json();
      if (data.fired > 0) {
        console.log(`[Scheduler] Tick fired ${data.fired} schedule(s): ${data.scheduleIds?.join(", ")}`);
      }
    } catch (err) {
      // Server may not be ready yet during cold start — silently ignore
    }
  });

  isStarted = true;
}

export function stopSchedulerService(): void {
  schedulerTask?.stop();
  schedulerTask = null;
  isStarted = false;
}

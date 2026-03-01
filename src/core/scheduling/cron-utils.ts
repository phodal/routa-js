/**
 * Cron utility helpers for schedule management.
 *
 * Wraps node-cron for expression validation and next-run computation.
 */

import nodeCron from "node-cron";

/**
 * Validate a 5-field cron expression (min hour dom mon dow).
 */
export function isValidCronExpr(expr: string): boolean {
  return nodeCron.validate(expr);
}

/**
 * Compute the next time a cron expression would fire, starting from `from`
 * (defaults to now). Returns `null` if the expression is invalid.
 *
 * Uses a simple polling approach: advance minute-by-minute up to ~1 year.
 */
export function getNextRunTime(expr: string, from?: Date): Date | null {
  if (!nodeCron.validate(expr)) return null;

  const start = from ? new Date(from) : new Date();
  // Round up to next minute boundary
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);

  const [min, hour, dom, mon, dow] = expr.trim().split(/\s+/);

  // Walk up to 366 days (minute by minute for up to ~1 year — limited to 2 days for perf)
  const maxIterations = 60 * 24 * 2; // check up to 2 days ahead
  const candidate = new Date(start);

  for (let i = 0; i < maxIterations; i++) {
    if (
      matchField(min, candidate.getMinutes(), 0, 59) &&
      matchField(hour, candidate.getHours(), 0, 23) &&
      matchField(dom, candidate.getDate(), 1, 31) &&
      matchField(mon, candidate.getMonth() + 1, 1, 12) &&
      matchField(dow, candidate.getDay(), 0, 6)
    ) {
      return new Date(candidate);
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  // Fallback: return 1 day from now if pattern doesn't match within 2 days
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

/**
 * Convert a cron expression to a human-readable description.
 */
export function describeCronExpr(expr: string): string {
  const presets: Record<string, string> = {
    "0 0 * * *": "Every day at midnight UTC",
    "0 1 * * *": "Every day at 01:00 UTC",
    "0 2 * * *": "Every day at 02:00 UTC",
    "0 3 * * *": "Every day at 03:00 UTC",
    "0 9 * * 1": "Every Monday at 09:00 UTC",
    "0 9 * * 5": "Every Friday at 09:00 UTC",
    "0 0 * * 0": "Every Sunday at midnight UTC",
    "0 * * * *": "Every hour",
    "*/30 * * * *": "Every 30 minutes",
    "0 0 1 * *": "First day of every month",
    "0 0 * * 1-5": "Every weekday at midnight UTC",
  };

  if (presets[expr]) return presets[expr];

  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, dom, mon, dow] = parts;

  if (dom === "*" && mon === "*" && dow === "*") {
    if (hour === "*" && min !== "*") return `Every hour at minute ${min}`;
    if (hour !== "*" && min === "0") {
      return `Every day at ${hour.padStart(2, "0")}:00 UTC`;
    }
    if (hour !== "*" && min !== "*") {
      return `Every day at ${hour.padStart(2, "0")}:${min.padStart(2, "0")} UTC`;
    }
  }

  if (dom === "*" && mon === "*" && dow !== "*") {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayName = dayNames[parseInt(dow)] ?? `day ${dow}`;
    if (hour !== "*" && min === "0") {
      return `Every ${dayName} at ${hour.padStart(2, "0")}:00 UTC`;
    }
  }

  return expr;
}

// ─── Internal Field Matcher ───────────────────────────────────────────────

function matchField(field: string, value: number, min: number, max: number): boolean {
  if (field === "*") return true;
  if (field.includes(",")) {
    return field.split(",").some((f) => matchField(f, value, min, max));
  }
  if (field.includes("-")) {
    const [lo, hi] = field.split("-").map(Number);
    return value >= lo && value <= hi;
  }
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2));
    return (value - min) % step === 0;
  }
  return parseInt(field) === value;
}

/**
 * Checklist Parser - Parse markdown checklist format from agent responses
 *
 * Parses checklist items like:
 * - [ ] Task pending
 * - [x] Task completed
 * - [/] Task in progress
 * - [-] Task cancelled
 */

export type ChecklistStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface ChecklistItem {
  id: string;
  text: string;
  status: ChecklistStatus;
  raw: string;
}

// Regex to match checklist items: - [ ], - [x], - [X], - [/], - [-]
const CHECKLIST_REGEX = /^[\t ]*[-*]\s*\[([ xX\/\-])\]\s+(.+?)$/gm;

/**
 * Parse markdown checklist items from content
 */
export function parseChecklist(content: string): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  let match: RegExpExecArray | null;
  let index = 0;

  // Reset regex state
  CHECKLIST_REGEX.lastIndex = 0;

  while ((match = CHECKLIST_REGEX.exec(content)) !== null) {
    const marker = match[1];
    const text = match[2].trim();

    let status: ChecklistStatus;
    switch (marker) {
      case "x":
      case "X":
        status = "completed";
        break;
      case "/":
        status = "in_progress";
        break;
      case "-":
        status = "cancelled";
        break;
      default:
        status = "pending";
    }

    items.push({
      id: `checklist-${index++}`,
      text,
      status,
      raw: match[0],
    });
  }

  return items;
}

/**
 * Check if content contains any checklist items
 */
export function hasChecklist(content: string): boolean {
  CHECKLIST_REGEX.lastIndex = 0;
  return CHECKLIST_REGEX.test(content);
}

/**
 * Count checklist statistics
 */
export function countChecklistStats(items: ChecklistItem[]): {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  cancelled: number;
} {
  const stats = {
    total: items.length,
    completed: 0,
    inProgress: 0,
    pending: 0,
    cancelled: 0,
  };

  for (const item of items) {
    switch (item.status) {
      case "completed":
        stats.completed++;
        break;
      case "in_progress":
        stats.inProgress++;
        break;
      case "pending":
        stats.pending++;
        break;
      case "cancelled":
        stats.cancelled++;
        break;
    }
  }

  return stats;
}


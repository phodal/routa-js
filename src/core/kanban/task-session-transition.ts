import type { Task } from "../models/task";
import { markTaskLaneSessionStatus } from "./task-lane-history";

type TaskSessionState = Pick<Task, "columnId" | "triggerSessionId" | "sessionIds" | "lastSyncError">;

export function archiveActiveTaskSession(task: Pick<Task, "triggerSessionId" | "sessionIds">): void {
  if (!task.triggerSessionId) {
    return;
  }
  if (!task.sessionIds.includes(task.triggerSessionId)) {
    task.sessionIds.push(task.triggerSessionId);
  }
}

export function prepareTaskForColumnChange(
  previousColumnId: string | undefined,
  task: TaskSessionState & Pick<Task, "laneSessions" | "laneHandoffs">,
): boolean {
  if (task.columnId === previousColumnId) {
    return false;
  }

  archiveActiveTaskSession(task);
  markTaskLaneSessionStatus(task, task.triggerSessionId, "transitioned");
  task.triggerSessionId = undefined;
  task.lastSyncError = undefined;
  return true;
}

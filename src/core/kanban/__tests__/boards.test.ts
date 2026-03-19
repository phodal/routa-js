import { describe, expect, it } from "vitest";
import { DEFAULT_KANBAN_COLUMNS } from "@/core/models/kanban";
import { applyRecommendedAutomationToColumns } from "../boards";

describe("applyRecommendedAutomationToColumns", () => {
  it("applies lane-specific specialists to a bare default board", () => {
    const columns = applyRecommendedAutomationToColumns(DEFAULT_KANBAN_COLUMNS);

    expect(columns.map((column) => column.automation?.steps?.[0]?.specialistId)).toEqual([
      "kanban-backlog-refiner",
      "kanban-todo-orchestrator",
      "kanban-dev-executor",
      "kanban-review-guard",
      "kanban-blocked-resolver",
      "kanban-done-reporter",
    ]);
    expect(columns.map((column) => column.automation?.steps?.[0]?.role)).toEqual([
      "CRAFTER",
      "CRAFTER",
      "CRAFTER",
      "GATE",
      "CRAFTER",
      "GATE",
    ]);
    expect(columns[0].automation?.autoAdvanceOnSuccess).toBe(true);
    expect(columns.slice(1).every((column) => column.automation?.autoAdvanceOnSuccess === false)).toBe(true);
    expect(columns[3]?.automation?.requiredArtifacts).toEqual(["screenshot"]);
  });

  it("backfills legacy backlog automation with system auto-advance", () => {
    const columns = applyRecommendedAutomationToColumns([
      {
        ...DEFAULT_KANBAN_COLUMNS[0],
        automation: {
          enabled: true,
          autoAdvanceOnSuccess: false,
        },
      },
      ...DEFAULT_KANBAN_COLUMNS.slice(1),
    ]);

    expect(columns[0].automation?.steps?.[0]?.specialistId).toBe("kanban-backlog-refiner");
    expect(columns[0].automation?.autoAdvanceOnSuccess).toBe(true);
  });

  it("refreshes system-owned backlog specialist settings on an existing default board", () => {
    const columns = applyRecommendedAutomationToColumns([
      {
        ...DEFAULT_KANBAN_COLUMNS[0],
        automation: {
          enabled: true,
          steps: [{
            id: "backlog-refiner",
            role: "CRAFTER",
            specialistId: "kanban-backlog-refiner",
            specialistName: "Backlog Refiner",
          }],
          specialistId: "kanban-backlog-refiner",
          specialistName: "Backlog Refiner",
          autoAdvanceOnSuccess: false,
        },
      },
    ]);

    expect(columns[0].automation?.steps?.[0]?.specialistId).toBe("kanban-backlog-refiner");
    expect(columns[0].automation?.autoAdvanceOnSuccess).toBe(true);
  });

  it("preserves specialist locale on system-owned default lane automation", () => {
    const columns = applyRecommendedAutomationToColumns([
      {
        ...DEFAULT_KANBAN_COLUMNS[0],
        automation: {
          enabled: true,
          steps: [{
            id: "backlog-refiner",
            role: "CRAFTER",
            specialistId: "kanban-backlog-refiner",
            specialistName: "Backlog Refiner",
            specialistLocale: "zh-CN",
          }],
          specialistId: "kanban-backlog-refiner",
          specialistName: "Backlog Refiner",
          specialistLocale: "zh-CN",
          autoAdvanceOnSuccess: false,
        },
      },
    ]);

    expect(columns[0].automation?.specialistLocale).toBe("zh-CN");
    expect(columns[0].automation?.steps?.[0]?.specialistLocale).toBe("zh-CN");
    expect(columns[0].automation?.autoAdvanceOnSuccess).toBe(true);
  });

  it("preserves a customized lane specialist", () => {
    const columns = applyRecommendedAutomationToColumns([
      {
        ...DEFAULT_KANBAN_COLUMNS[2],
        automation: {
          enabled: true,
          steps: [{
            id: "custom-dev-step",
            role: "DEVELOPER",
            specialistId: "custom-dev-sweeper",
            specialistName: "Custom Dev Sweeper",
          }],
          autoAdvanceOnSuccess: true,
        },
      },
    ]);

    expect(columns[0].automation?.steps?.[0]?.specialistId).toBe("custom-dev-sweeper");
    expect(columns[0].automation?.autoAdvanceOnSuccess).toBe(true);
  });

  it("backfills the review screenshot gate when the lane has no explicit artifact policy", () => {
    const columns = applyRecommendedAutomationToColumns([
      DEFAULT_KANBAN_COLUMNS[3],
    ]);

    expect(columns[0].automation?.requiredArtifacts).toEqual(["screenshot"]);
  });
});

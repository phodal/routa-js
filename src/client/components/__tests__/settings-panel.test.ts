import { describe, it, expect, beforeEach } from "vitest";
import {
  loadDefaultProviders,
  saveDefaultProviders,
  type DefaultProviderSettings,
} from "../settings-panel";

describe("settings-panel default provider helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty object when nothing is stored", () => {
    expect(loadDefaultProviders()).toEqual({});
  });

  it("round-trips settings through localStorage", () => {
    const settings: DefaultProviderSettings = {
      ROUTA: "claude-code-sdk",
      CRAFTER: "opencode-sdk",
    };
    saveDefaultProviders(settings);
    expect(loadDefaultProviders()).toEqual(settings);
  });

  it("handles invalid JSON gracefully", () => {
    localStorage.setItem("routa.defaultProviders", "not-json");
    expect(loadDefaultProviders()).toEqual({});
  });

  it("preserves partial settings", () => {
    saveDefaultProviders({ GATE: "gemini" });
    const loaded = loadDefaultProviders();
    expect(loaded.GATE).toBe("gemini");
    expect(loaded.ROUTA).toBeUndefined();
  });
});

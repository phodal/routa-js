import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadDefaultProviders,
  saveDefaultProviders,
  type DefaultProviderSettings,
  type AgentModelConfig,
} from "../settings-panel";

// Mock localStorage for jsdom environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
});

describe("settings-panel default provider helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("returns empty object when nothing is stored", () => {
    expect(loadDefaultProviders()).toEqual({});
  });

  it("round-trips AgentModelConfig settings through localStorage", () => {
    const settings: DefaultProviderSettings = {
      ROUTA: { provider: "claude-code-sdk", model: "claude-opus-4-5" },
      CRAFTER: { provider: "claude-code-sdk", model: "claude-3-5-haiku-20241022" },
    };
    saveDefaultProviders(settings);
    expect(loadDefaultProviders()).toEqual(settings);
  });

  it("handles invalid JSON gracefully", () => {
    localStorage.setItem("routa.defaultProviders", "not-json");
    expect(loadDefaultProviders()).toEqual({});
  });

  it("normalises legacy string-only provider values on load", () => {
    // Simulate old format stored in localStorage (bare provider-id string)
    localStorage.setItem("routa.defaultProviders", JSON.stringify({ GATE: "gemini" }));
    const loaded = loadDefaultProviders();
    expect(loaded.GATE).toEqual({ provider: "gemini" });
    expect(loaded.ROUTA).toBeUndefined();
  });

  it("preserves partial AgentModelConfig settings", () => {
    saveDefaultProviders({ GATE: { provider: "gemini", model: "gemini-pro" } });
    const loaded = loadDefaultProviders();
    expect(loaded.GATE).toEqual({ provider: "gemini", model: "gemini-pro" });
    expect(loaded.ROUTA).toBeUndefined();
  });
});

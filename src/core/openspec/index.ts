import type { OpenSpec } from "./types";
import type { SpecialistConfig } from "../orchestration/specialist-prompts";

/**
 * Convert a SpecialistConfig into a minimal OpenSpec.
 * The mapping is intentionally conservative: only fields that have
 * clear equivalents are mapped. Callers may enrich further.
 */
export function specFromSpecialist(s: SpecialistConfig): OpenSpec {
  return {
    name: s.name,
    system_prompt: s.systemPrompt,
    metadata: {
      id: s.id,
      role: s.role,
      source: s.source,
      description: s.description,
    },
  };
}

/**
 * Merge multiple OpenSpecs into a single composite OpenSpec.
 * - concatenates tools
 * - shallow-merges inputs/outputs/metadata/llm_config (later specs win)
 */
export function mergeOpenSpecs(specs: OpenSpec[]): OpenSpec {
  if (!specs || specs.length === 0) return { name: "<empty>" };
  const base: OpenSpec = { ...specs[0] };
  for (let i = 1; i < specs.length; i++) {
    const s = specs[i];
    base.tools = [...(base.tools || []), ...(s.tools || [])];
    base.inputs = { ...(base.inputs || {}), ...(s.inputs || {}) };
    base.outputs = { ...(base.outputs || {}), ...(s.outputs || {}) };
    base.metadata = { ...(base.metadata || {}), ...(s.metadata || {}) };
    base.llm_config = { ...(base.llm_config || {}), ...(s.llm_config || {}) };
  }
  return base;
}

export type { OpenSpec } from "./types";

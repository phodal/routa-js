// OpenSpec TypeScript types

export type PrimitiveType = "string" | "number" | "boolean" | "object" | "array" | "any";

export interface SchemaSpec {
  type?: PrimitiveType | string;
  description?: string;
  required?: boolean;
  properties?: Record<string, SchemaSpec>;
  items?: SchemaSpec;
  enum?: Array<string | number | boolean>;
  // allow arbitrary extensions for tool-specific schemas
  [key: string]: any;
}

export interface LLMConfig {
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  // provider-specific extras
  [key: string]: any;
}

export interface ToolSpec {
  id: string;
  name: string;
  description?: string;
  inputs?: Record<string, SchemaSpec>;
  outputs?: Record<string, SchemaSpec>;
  config?: Record<string, any>;
}

export interface OpenSpec {
  // human friendly name
  name: string;
  // optional semantic version or tag
  version?: string;
  // optional system prompt / assistant instructions
  system_prompt?: string;
  // preferred LLM configuration
  llm_config?: LLMConfig;
  // tools used or provided by this specialist/spec
  tools?: ToolSpec[];
  // inputs and outputs shapes
  inputs?: Record<string, SchemaSpec>;
  outputs?: Record<string, SchemaSpec>;
  // miscellaneous metadata
  metadata?: Record<string, any>;
}

export type OpenSpecMap = Record<string, OpenSpec>;

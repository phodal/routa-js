/**
 * OpenAPI Schema Validator
 *
 * Parses api-contract.yaml and builds AJV validators for each schema and
 * operation response. Used to validate that runtime API responses conform
 * to the declared OpenAPI contract.
 *
 * Usage:
 *   import { validateSchema, validateOperationResponse, getSchemaValidator } from "./schema-validator";
 *   const errors = validateSchema("Agent", responseBody);
 *   const errors = validateOperationResponse("listAgents", 200, responseBody);
 */

import * as fs from "fs";
import * as path from "path";
import Ajv, { type ValidateFunction, type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import yaml from "js-yaml";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────
export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

interface OpenAPISchema {
  openapi: string;
  info: Record<string, unknown>;
  components: {
    schemas: Record<string, unknown>;
  };
  paths: Record<
    string,
    Record<
      string,
      {
        operationId?: string;
        responses?: Record<
          string,
          {
            content?: Record<
              string,
              {
                schema?: unknown;
              }
            >;
          }
        >;
        requestBody?: {
          content?: Record<
            string,
            {
              schema?: unknown;
            }
          >;
        };
      }
    >
  >;
}

// ─────────────────────────────────────────────────────────
// Load and parse api-contract.yaml
// ─────────────────────────────────────────────────────────
const contractPath = path.resolve(__dirname, "../../api-contract.yaml");
let _contract: OpenAPISchema | null = null;

function getContract(): OpenAPISchema {
  if (_contract) return _contract;
  if (!fs.existsSync(contractPath)) {
    throw new Error(`api-contract.yaml not found at ${contractPath}`);
  }
  const content = fs.readFileSync(contractPath, "utf-8");
  _contract = yaml.load(content) as OpenAPISchema;
  return _contract;
}

// ─────────────────────────────────────────────────────────
// Ref normalization and schema building
// ─────────────────────────────────────────────────────────

/**
 * Normalize $ref paths from OpenAPI format to JSON Schema $defs format.
 * "#/components/schemas/X" → "#/$defs/X"
 */
function normalizeRefs(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(normalizeRefs);
  const obj = schema as Record<string, unknown>;
  if (typeof obj.$ref === "string") {
    return { $ref: obj.$ref.replace(/^#\/components\/schemas\//, "#/$defs/") };
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = normalizeRefs(v);
  }
  return result;
}

/**
 * Build a standalone schema with $defs for AJV.
 * Converts OpenAPI component refs to JSON Schema $defs refs.
 */
function buildStandaloneSchema(schema: unknown): unknown {
  const contract = getContract();
  const componentSchemas = contract.components?.schemas ?? {};

  // Build normalized $defs from all component schemas
  const defs: Record<string, unknown> = {};
  for (const [name, s] of Object.entries(componentSchemas)) {
    defs[name] = normalizeRefs(s);
  }

  return {
    $defs: defs,
    ...normalizeRefs(schema) as object,
  };
}

// ─────────────────────────────────────────────────────────
// Cache for compiled validators
// ─────────────────────────────────────────────────────────
const _schemaValidators = new Map<string, ValidateFunction>();
const _operationValidators = new Map<string, ValidateFunction>();

/**
 * Get a compiled AJV validator for a named component schema.
 */
export function getSchemaValidator(schemaName: string): ValidateFunction {
  if (_schemaValidators.has(schemaName)) {
    return _schemaValidators.get(schemaName)!;
  }

  const contract = getContract();
  const schema = contract.components?.schemas?.[schemaName];
  if (!schema) {
    throw new Error(`Schema "${schemaName}" not found in api-contract.yaml components.schemas`);
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const inlined = buildStandaloneSchema(schema);
  const validate = ajv.compile(inlined as object);
  _schemaValidators.set(schemaName, validate);
  return validate;
}

/**
 * Get a compiled AJV validator for a specific operation's response schema.
 */
export function getOperationResponseValidator(
  operationId: string,
  statusCode: number | string
): ValidateFunction | null {
  const cacheKey = `${operationId}:${statusCode}`;
  if (_operationValidators.has(cacheKey)) {
    return _operationValidators.get(cacheKey)!;
  }

  const contract = getContract();
  const statusStr = String(statusCode);

  // Search all paths for the operationId
  for (const [, methods] of Object.entries(contract.paths ?? {})) {
    for (const [, operation] of Object.entries(methods)) {
      if (!operation || typeof operation !== "object") continue;
      const op = operation as {
        operationId?: string;
        responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
      };
      if (op.operationId !== operationId) continue;

      const responseObj = op.responses?.[statusStr];
      if (!responseObj) return null;

      const schema = responseObj.content?.["application/json"]?.schema;
      if (!schema) return null;

      const ajv = new Ajv({ allErrors: true, strict: false });
      addFormats(ajv);
      const inlined = buildStandaloneSchema(schema);
      const validate = ajv.compile(inlined as object);
      _operationValidators.set(cacheKey, validate);
      return validate;
    }
  }

  return null;
}

/**
 * Validate data against a named component schema.
 */
export function validateSchema(
  schemaName: string,
  data: unknown
): SchemaValidationResult {
  try {
    const validate = getSchemaValidator(schemaName);
    const valid = validate(data) as boolean;
    const errors = valid
      ? []
      : formatErrors(validate.errors ?? [], schemaName);
    return { valid, errors };
  } catch (err) {
    return {
      valid: false,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

/**
 * Validate a runtime response body against an operation's declared response schema.
 */
export function validateOperationResponse(
  operationId: string,
  statusCode: number | string,
  data: unknown
): SchemaValidationResult {
  try {
    const validate = getOperationResponseValidator(operationId, statusCode);
    if (!validate) {
      // No schema declared → treat as valid (schema not required)
      return { valid: true, errors: [] };
    }
    const valid = validate(data) as boolean;
    const errors = valid
      ? []
      : formatErrors(validate.errors ?? [], `${operationId}:${statusCode}`);
    return { valid, errors };
  } catch (err) {
    return {
      valid: false,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

/**
 * Validate a request body against an operation's declared request schema.
 */
export function validateOperationRequest(
  operationId: string,
  data: unknown
): SchemaValidationResult {
  try {
    const contract = getContract();

    // Search all paths for the operationId
    for (const [, methods] of Object.entries(contract.paths ?? {})) {
      for (const [, operation] of Object.entries(methods)) {
        if (!operation || typeof operation !== "object") continue;
        const op = operation as {
          operationId?: string;
          requestBody?: { content?: Record<string, { schema?: unknown }> };
        };
        if (op.operationId !== operationId) continue;

        const schema = op.requestBody?.content?.["application/json"]?.schema;
        if (!schema) return { valid: true, errors: [] };

        const ajv = new Ajv({ allErrors: true, strict: false });
        addFormats(ajv);
        const inlined = buildStandaloneSchema(schema);
        const validate = ajv.compile(inlined as object);
        const valid = validate(data) as boolean;
        const errors = valid
          ? []
          : formatErrors(validate.errors ?? [], `${operationId}:request`);
        return { valid, errors };
      }
    }
    return { valid: true, errors: [] };
  } catch (err) {
    return {
      valid: false,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

/**
 * List all operation IDs defined in the contract.
 */
export function listOperationIds(): string[] {
  const contract = getContract();
  const ids: string[] = [];
  for (const methods of Object.values(contract.paths ?? {})) {
    for (const operation of Object.values(methods)) {
      if (operation && typeof operation === "object") {
        const op = operation as { operationId?: string };
        if (op.operationId) ids.push(op.operationId);
      }
    }
  }
  return ids;
}

/**
 * Get all paths and their operations from the contract.
 */
export function listContractEndpoints(): Array<{
  path: string;
  method: string;
  operationId: string;
  hasRequestSchema: boolean;
  hasResponseSchema: boolean;
}> {
  const contract = getContract();
  const httpMethods = ["get", "post", "put", "delete", "patch", "options", "head"];
  const endpoints = [];

  for (const [apiPath, methods] of Object.entries(contract.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!httpMethods.includes(method.toLowerCase())) continue;
      if (!operation || typeof operation !== "object") continue;
      const op = operation as {
        operationId?: string;
        responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
        requestBody?: { content?: Record<string, { schema?: unknown }> };
      };

      const hasRequestSchema = !!op.requestBody?.content?.["application/json"]?.schema;
      const hasResponseSchema = Object.values(op.responses ?? {}).some(
        (r) => r.content?.["application/json"]?.schema
      );

      endpoints.push({
        path: apiPath,
        method: method.toUpperCase(),
        operationId: op.operationId ?? `${method.toUpperCase()}:${apiPath}`,
        hasRequestSchema,
        hasResponseSchema,
      });
    }
  }

  return endpoints;
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────
function formatErrors(errors: ErrorObject[], context: string): string[] {
  return errors.map((e) => {
    const location = e.instancePath ? `[${context}]${e.instancePath}` : `[${context}]`;
    return `${location} ${e.message ?? "validation failed"}${
      e.params && Object.keys(e.params).length ? ` (${JSON.stringify(e.params)})` : ""
    }`;
  });
}

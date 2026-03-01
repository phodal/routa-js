/**
 * Shared test helpers for API contract tests.
 *
 * These tests run against whichever backend is at BASE_URL.
 * Usage:
 *   BASE_URL=http://localhost:3000 npx tsx tests/api-contract/run.ts   # Next.js
 *   BASE_URL=http://localhost:3210 npx tsx tests/api-contract/run.ts   # Rust
 */

import { validateSchema, validateOperationResponse, validateOperationRequest } from "./schema-validator";

export { validateSchema, validateOperationResponse, validateOperationRequest };

export const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

export async function api(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown; headers: Headers }> {
  const url = `${BASE_URL}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data, headers: res.headers };
}

export function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertStatus(actual: number, expected: number) {
  assert(
    actual === expected,
    `Expected status ${expected}, got ${actual}`
  );
}

export function assertHasField(obj: unknown, field: string) {
  assert(
    typeof obj === "object" && obj !== null && field in obj,
    `Expected field "${field}" in response`
  );
}

export function assertFieldType(obj: Record<string, unknown>, field: string, type: string) {
  assertHasField(obj, field);
  assert(
    typeof obj[field] === type,
    `Expected "${field}" to be ${type}, got ${typeof obj[field]}`
  );
}

export function assertArrayField(obj: Record<string, unknown>, field: string) {
  assertHasField(obj, field);
  assert(
    Array.isArray(obj[field]),
    `Expected "${field}" to be an array`
  );
}

export function assertEnum(value: unknown, allowedValues: string[], fieldName: string) {
  assert(
    typeof value === "string" && allowedValues.includes(value),
    `Expected "${fieldName}" to be one of [${allowedValues.join(", ")}], got "${value}"`
  );
}

/**
 * Assert that data matches the named component schema from api-contract.yaml.
 * Throws with a descriptive error listing all schema violations.
 */
export function assertMatchesSchema(schemaName: string, data: unknown): void {
  const result = validateSchema(schemaName, data);
  if (!result.valid) {
    throw new Error(
      `Schema "${schemaName}" validation failed:\n  ${result.errors.join("\n  ")}`
    );
  }
}

/**
 * Assert that an operation response matches the declared OpenAPI response schema.
 * @param operationId - The operationId from api-contract.yaml
 * @param statusCode  - HTTP status code (e.g. 200)
 * @param data        - Response body to validate
 */
export function assertMatchesOperationResponse(
  operationId: string,
  statusCode: number,
  data: unknown
): void {
  const result = validateOperationResponse(operationId, statusCode, data);
  if (!result.valid) {
    throw new Error(
      `Operation "${operationId}" response schema (HTTP ${statusCode}) validation failed:\n  ${result.errors.join("\n  ")}`
    );
  }
}

/**
 * Assert that a request body matches the declared OpenAPI request schema.
 * @param operationId - The operationId from api-contract.yaml
 * @param data        - Request body to validate
 */
export function assertMatchesOperationRequest(
  operationId: string,
  data: unknown
): void {
  const result = validateOperationRequest(operationId, data);
  if (!result.valid) {
    throw new Error(
      `Operation "${operationId}" request schema validation failed:\n  ${result.errors.join("\n  ")}`
    );
  }
}

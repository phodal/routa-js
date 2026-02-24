#!/usr/bin/env npx tsx
import { validateOpenSpec } from "../../src/core/openspec/validator";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}
function run(name: string, fn: () => void) {
  try {
    fn();
    passed++; console.log(`✓ ${name}`);
  } catch (e) {
    failed++; console.log(`✗ ${name}`); console.log(`  ${e instanceof Error ? e.message : String(e)}`);
  }
}

run('reject non-object spec', () => {
  const res = validateOpenSpec(null as any);
  assert(res.length === 1 && res[0].code === 'INVALID_TYPE', 'expected INVALID_TYPE for null');
});

run('missing top-level fields', () => {
  const res = validateOpenSpec({});
  const codes = res.map(r => r.code).filter(Boolean) as string[];
  assert(codes.includes('MISSING_FIELD'), 'expected MISSING_FIELD for missing top-level');
});

run('invalid openapi type', () => {
  const res = validateOpenSpec({ openapi: 3, info: { title: 't', version: 'v' }, paths: {} } as any);
  assert(res.some(r => r.path === 'root.openapi' && r.code === 'INVALID_TYPE'), 'expected invalid openapi type');
});

run('info missing title/version', () => {
  const res = validateOpenSpec({ openapi: '3.0.0', info: {}, paths: {} });
  assert(res.some(r => r.path === 'root.info.title' && r.code === 'MISSING_FIELD'), 'expected missing title');
  assert(res.some(r => r.path === 'root.info.version' && r.code === 'MISSING_FIELD'), 'expected missing version');
});

run('paths operation missing responses', () => {
  const spec = { openapi: '3.0.0', info: { title: 't', version: 'v' }, paths: { '/x': { get: { description: 'ok' } } } };
  const res = validateOpenSpec(spec as any);
  assert(res.some(r => r.path === 'root.paths/x.get.responses' || r.path === 'root.paths./x.get.responses' || r.message.includes('responses')), 'expected missing responses error');
});

run('valid spec returns no errors', () => {
  const spec = { openapi: '3.0.0', info: { title: 't', version: 'v' }, paths: { '/x': { get: { responses: { '200': { description: 'ok' } } } } } };
  const res = validateOpenSpec(spec as any);
  assert(res.length === 0, `expected no errors, got ${res.length}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

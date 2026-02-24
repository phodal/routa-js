import { strict as assert } from 'assert';
import { parseOpenSpecYAML } from '../../src/core/openspec/parser';

function runTests() {
  // Success case: simple YAML
  const yaml = `name: test\nversion: 1.0`;
  const obj = parseOpenSpecYAML(yaml);
  assert.equal(obj.name, 'test');
  // Ensure version is present (yaml may parse as string or number)
  assert.ok(obj.version !== undefined);

  // Success case: JSON content
  const json = '{"name":"json-test","items":[1,2,3]}';
  const obj2 = parseOpenSpecYAML(json);
  assert.equal(obj2.name, 'json-test');
  assert.ok(Array.isArray(obj2.items));

  // Failure case: invalid YAML
  let threw = false;
  try {
    parseOpenSpecYAML(':\n');
  } catch (e: any) {
    threw = true;
    assert.ok(/Failed to parse OpenSpec/.test(e.message));
  }
  if (!threw) throw new Error('Expected invalid YAML to throw');

  // Failure case: empty content
  threw = false;
  try {
    parseOpenSpecYAML('   \n  ');
  } catch (e: any) {
    threw = true;
    assert.ok(/empty/i.test(e.message));
  }
  if (!threw) throw new Error('Expected empty content to throw');

  console.log('ALL TESTS PASSED');
}

runTests();

import { load } from 'js-yaml';

export type OpenSpec = any; // intentionally loose; validate elsewhere

export function parseOpenSpecYAML(content: string): OpenSpec {
  try {
    if (!content || !content.toString().trim()) {
      throw new Error('Spec content is empty');
    }
    const parsed = load(content);
    if (parsed === null || parsed === undefined) {
      throw new Error('Parsed spec is empty');
    }
    if (typeof parsed !== 'object') {
      throw new Error('Parsed spec is not an object');
    }
    return parsed as OpenSpec;
  } catch (err: any) {
    const msg = err && err.message ? err.message : String(err);
    throw new Error(`Failed to parse OpenSpec: ${msg}`);
  }
}

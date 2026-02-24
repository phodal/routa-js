export type OpenSpecError = {
  path: string; // JSON path like `root.data.title`
  message: string;
  code?: string;
};

export type OpenSpec = any; // parser.ts output shape - accept any for now

/**
 * validateOpenSpec
 * - Checks for missing required top-level fields and common type errors
 * - Returns an array of structured errors (empty array when valid)
 */
export function validateOpenSpec(spec: OpenSpec): OpenSpecError[] {
  const errors: OpenSpecError[] = [];

  if (!spec || typeof spec !== 'object') {
    errors.push({ path: 'root', message: 'Spec must be an object', code: 'INVALID_TYPE' });
    return errors;
  }

  // Required top-level fields (simplified from official schema)
  const requiredTopLevel = ['openapi', 'info', 'paths'];
  for (const field of requiredTopLevel) {
    if (!(field in spec)) {
      errors.push({ path: `root.${field}`, message: `Missing required field '${field}'`, code: 'MISSING_FIELD' });
    }
  }

  // openapi must be string
  if ('openapi' in spec && typeof spec.openapi !== 'string') {
    errors.push({ path: 'root.openapi', message: `Field 'openapi' must be a string`, code: 'INVALID_TYPE' });
  }

  // info must be object with required title and version
  if ('info' in spec) {
    if (!spec.info || typeof spec.info !== 'object') {
      errors.push({ path: 'root.info', message: `Field 'info' must be an object`, code: 'INVALID_TYPE' });
    } else {
      if (!('title' in spec.info)) {
        errors.push({ path: 'root.info.title', message: `Missing required field 'title' in info`, code: 'MISSING_FIELD' });
      } else if (typeof spec.info.title !== 'string') {
        errors.push({ path: 'root.info.title', message: `Field 'title' must be a string`, code: 'INVALID_TYPE' });
      }
      if (!('version' in spec.info)) {
        errors.push({ path: 'root.info.version', message: `Missing required field 'version' in info`, code: 'MISSING_FIELD' });
      } else if (typeof spec.info.version !== 'string') {
        errors.push({ path: 'root.info.version', message: `Field 'version' must be a string`, code: 'INVALID_TYPE' });
      }
    }
  }

  // paths must be object
  if ('paths' in spec) {
    if (!spec.paths || typeof spec.paths !== 'object' || Array.isArray(spec.paths)) {
      errors.push({ path: 'root.paths', message: `Field 'paths' must be an object`, code: 'INVALID_TYPE' });
    } else {
      // Check each path item is object and has operation objects
      for (const [p, item] of Object.entries(spec.paths)) {
        const basePath = `root.paths${p.startsWith('/') ? '' : '.'}${p}`;
        if (!item || typeof item !== 'object') {
          errors.push({ path: basePath, message: `Path item must be an object`, code: 'INVALID_TYPE' });
          continue;
        }
        // operations like get/post should be objects with responses
        const operations = ['get','post','put','delete','patch','options','head'];
        for (const op of operations) {
          if (op in item) {
            const opObj = (item as any)[op];
            if (!opObj || typeof opObj !== 'object') {
              errors.push({ path: `${basePath}.${op}`, message: `Operation '${op}' must be an object`, code: 'INVALID_TYPE' });
            } else {
              if (!('responses' in opObj)) {
                errors.push({ path: `${basePath}.${op}.responses`, message: `Missing required 'responses' for operation '${op}'`, code: 'MISSING_FIELD' });
              } else if (typeof opObj.responses !== 'object') {
                errors.push({ path: `${basePath}.${op}.responses`, message: `'responses' must be an object`, code: 'INVALID_TYPE' });
              }
            }
          }
        }
      }
    }
  }

  return errors;
}

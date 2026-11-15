/**
 * A simple JSON diff utility that compares two values and returns
 * an array of differences.
 */

export interface DiffResult {
  path: string;
  old?: unknown;
  new?: unknown;
  type: "added" | "removed" | "changed";
}

/**
 * Compares two values and returns an array of differences.
 * Works with primitives, objects, and arrays.
 */
export function diff(oldValue: unknown, newValue: unknown): DiffResult[] {
  const results: DiffResult[] = [];
  compareValues(oldValue, newValue, "", results);
  return results;
}

/**
 * Compares two values recursively and pushes differences to the results array.
 */
function compareValues(
  oldVal: unknown,
  newVal: unknown,
  path: string,
  results: DiffResult[],
): void {
  // Both are the same reference or both are null/undefined
  if (oldVal === newVal) {
    return;
  }

  // Both are primitives (not equal since we passed the === check)
  if (isPrimitive(oldVal) && isPrimitive(newVal)) {
    results.push({
      path,
      old: oldVal,
      new: newVal,
      type: "changed",
    });
    return;
  }

  // Old is primitive, new is object
  if (isPrimitive(oldVal) && !isPrimitive(newVal)) {
    if (Array.isArray(newVal)) {
      for (let i = 0; i < newVal.length; i++) {
        compareValues(undefined, newVal[i], `${path}[${i}]`, results);
      }
    } else {
      const obj = newVal as Record<string, unknown>;
      for (const key of Object.keys(obj)) {
        compareValues(
          undefined,
          obj[key],
          path ? `${path}.${key}` : key,
          results,
        );
      }
    }
    return;
  }

  // Old is object, new is primitive
  if (!isPrimitive(oldVal) && isPrimitive(newVal)) {
    if (Array.isArray(oldVal)) {
      for (let i = 0; i < oldVal.length; i++) {
        compareValues(oldVal[i], undefined, `${path}[${i}]`, results);
      }
    } else {
      const obj = oldVal as Record<string, unknown>;
      for (const key of Object.keys(obj)) {
        compareValues(
          obj[key],
          undefined,
          path ? `${path}.${key}` : key,
          results,
        );
      }
    }
    results.push({
      path,
      old: oldVal,
      new: newVal,
      type: "changed",
    });
    return;
  }

  // Both are arrays
  if (Array.isArray(oldVal) && Array.isArray(newVal)) {
    const maxLen = Math.max(oldVal.length, newVal.length);
    for (let i = 0; i < maxLen; i++) {
      const oldItem = i < oldVal.length ? oldVal[i] : undefined;
      const newItem = i < newVal.length ? newVal[i] : undefined;
      compareValues(oldItem, newItem, `${path}[${i}]`, results);
    }
    return;
  }

  // Both are objects
  if (
    typeof oldVal === "object" &&
    typeof newVal === "object" &&
    oldVal !== null &&
    newVal !== null
  ) {
    const oldObj = oldVal as Record<string, unknown>;
    const newObj = newVal as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

    for (const key of allKeys) {
      const oldItem = key in oldObj ? oldObj[key] : undefined;
      const newItem = key in newObj ? newObj[key] : undefined;
      const childPath = path ? `${path}.${key}` : key;
      compareValues(oldItem, newItem, childPath, results);
    }
    return;
  }

  // Fallback: treat as changed
  results.push({
    path,
    old: oldVal,
    new: newVal,
    type: "changed",
  });
}

/**
 * Checks if a value is a primitive (not an object or array).
 */
function isPrimitive(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

/**
 * Formats a diff result into a human-readable string.
 */
export function formatDiff(diff: DiffResult): string {
  switch (diff.type) {
    case "added":
      return `+ ${diff.path}: ${JSON.stringify(diff.new)}`;
    case "removed":
      return `- ${diff.path}: ${JSON.stringify(diff.old)}`;
    case "changed":
      return `~ ${diff.path}: ${JSON.stringify(diff.old)} → ${JSON.stringify(diff.new)}`;
    default:
      return `${diff.path}: ${JSON.stringify(diff.old)} → ${JSON.stringify(diff.new)}`;
  }
}

/**
 * Formats all diffs into a human-readable string.
 */
export function formatDiffs(diffs: DiffResult[]): string {
  return diffs.map(formatDiff).join("\n");
}

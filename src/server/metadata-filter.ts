import { z } from 'zod';

const primitiveScalarSchema = z.union([z.string(), z.number(), z.boolean()]);

// Recursive Zod schema for Pinecone metadata filters
// Supports nested objects with operators like {"timestamp": {"$gte": 123}}
const metadataFilterValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    primitiveScalarSchema,
    z.array(primitiveScalarSchema),
    z.array(z.lazy(() => metadataFilterSchema)),
    z.record(z.string(), metadataFilterValueSchema), // Recursive for nested operators
  ])
);

export const metadataFilterSchema = z.record(z.string(), metadataFilterValueSchema);
const ALLOWED_FILTER_OPERATORS = new Set([
  '$eq',
  '$ne',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
  '$in',
  '$nin',
  '$and',
  '$or',
]);

/** True if value is a string, number, or boolean (allowed for $eq, $gt, etc.). */
function isPrimitiveFilterValue(value: unknown): boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** True if value is an array of JSON primitives (allowed for $in/$nin). */
function isPrimitiveArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))
  );
}

/** Recursively validate a filter value; returns an error string or null if valid. */
function validateMetadataFilterValue(value: unknown, path: string[]): string | null {
  if (value === null || value === undefined) {
    return `Invalid null/undefined at "${path.join('.')}".`;
  }

  if (isPrimitiveFilterValue(value) || isPrimitiveArray(value)) {
    return null;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        return `Operator "${path[path.length - 1]}" at "${[...path, String(i)].join('.')}" must use an array of filter objects.`;
      }
      const nestedError = validateMetadataFilter(item as Record<string, unknown>);
      if (nestedError) return nestedError;
    }
    return null;
  }

  if (typeof value !== 'object') {
    return `Unsupported filter value at "${path.join('.')}".`;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (!key.startsWith('$')) {
      return `Nested metadata filters must use operator keys starting with "$" at "${path.join('.')}"; got "${key}".`;
    }
    if (!ALLOWED_FILTER_OPERATORS.has(key)) {
      return `Unknown filter operator "${key}" at "${path.join('.')}". Allowed operators: ${[...ALLOWED_FILTER_OPERATORS].join(', ')}.`;
    }
    if ((key === '$in' || key === '$nin') && !isPrimitiveArray(nestedValue)) {
      return `Operator "${key}" at "${path.join('.')}" must use an array of primitive values.`;
    }
    if (
      (key === '$eq' ||
        key === '$ne' ||
        key === '$gt' ||
        key === '$gte' ||
        key === '$lt' ||
        key === '$lte') &&
      !isPrimitiveFilterValue(nestedValue)
    ) {
      return `Operator "${key}" at "${path.join('.')}" must use a primitive value.`;
    }
    if ((key === '$and' || key === '$or') && !Array.isArray(nestedValue)) {
      return `Operator "${key}" at "${path.join('.')}" must use an array of filter objects.`;
    }

    const nestedError = validateMetadataFilterValue(nestedValue, [...path, key]);
    if (nestedError) {
      return nestedError;
    }
  }

  return null;
}

/** Validate a Pinecone metadata filter object; returns an error message or null if valid. */
export function validateMetadataFilter(filter: Record<string, unknown>): string | null {
  for (const [field, value] of Object.entries(filter)) {
    const error = validateMetadataFilterValue(value, [field]);
    if (error) return error;
  }
  return null;
}

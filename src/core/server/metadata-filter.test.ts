import { describe, expect, it } from 'vitest';
import { validateMetadataFilter, validateMetadataFilterDetailed } from './metadata-filter.js';

describe('validateMetadataFilterDetailed', () => {
  it('returns null for a valid filter', () => {
    expect(
      validateMetadataFilterDetailed({
        year: { $gte: 2020, $lte: 2026 },
        tags: { $in: ['a', 'b'] },
      })
    ).toBeNull();
  });

  it('returns message and dot-path field for unknown nested operator', () => {
    const d = validateMetadataFilterDetailed({
      year: { $regex: '^202' },
    });
    expect(d).not.toBeNull();
    expect(d!.message).toContain('Unknown filter operator');
    expect(d!.field).toBe('year.$regex');
    expect(validateMetadataFilter({ year: { $regex: '^202' } })).toBe(d!.message);
  });

  it('returns field for invalid $in value', () => {
    const d = validateMetadataFilterDetailed({
      tags: { $in: 'not-an-array' },
    });
    expect(d!.field).toBe('tags.$in');
    expect(d!.message).toContain('primitive values');
  });

  it('returns field for null metadata value', () => {
    const d = validateMetadataFilterDetailed({
      author: null as unknown as Record<string, unknown>,
    });
    expect(d!.field).toBe('author');
    expect(d!.message).toContain('null');
  });

  it('returns field when nested $and value is not an array', () => {
    const d = validateMetadataFilterDetailed({
      tags: { $and: { $eq: 'x' } },
    });
    expect(d!.field).toBe('tags.$and');
  });

  it('returns field when nested $or array element is an array, not a filter object', () => {
    const d = validateMetadataFilterDetailed({
      tags: { $or: [[1]] },
    });
    expect(d!.field).toBe('tags.$or.0');
  });
});

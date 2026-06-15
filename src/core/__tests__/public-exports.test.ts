import { describe, expect, it } from 'vitest';
import * as core from '../index.js';

describe('public export surface', () => {
  it('does not export internal experimental block builders', () => {
    expect('buildQueryExperimental' in core).toBe(false);
    expect('buildGuidedQueryExperimental' in core).toBe(false);
  });
});

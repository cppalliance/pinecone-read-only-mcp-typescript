import { vi } from 'vitest';

/** First call throws structured HTTP 429; subsequent calls resolve with `success`. */
export function makeStructured429Once<T>(success: T): ReturnType<typeof vi.fn> {
  let n = 0;
  return vi.fn().mockImplementation(async () => {
    n++;
    if (n < 2) {
      throw Object.assign(new Error('Rate limited'), { status: 429 });
    }
    return success;
  });
}

import { redactApiKey } from '../../src/logger.js';

/**
 * Exit a demo script with a redacted error detail (CodeQL: js/clear-text-logging).
 */
export function exitOnDemoFailure(label: string): (err: unknown) => void {
  return (err: unknown) => {
    const detail = redactApiKey(err instanceof Error ? err.message : String(err));
    console.error(`${label} failed: ${detail}`);
    console.error('Check credentials and index configuration.');
    process.exitCode = 1;
  };
}

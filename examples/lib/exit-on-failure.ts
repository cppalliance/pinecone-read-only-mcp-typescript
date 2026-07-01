/**
 * Exit a demo script without logging the raw error object (CodeQL: js/clear-text-logging).
 */
export function exitOnDemoFailure(label: string): () => never {
  return () => {
    console.error(`${label} failed. Check credentials and index configuration.`);
    process.exit(1);
  };
}

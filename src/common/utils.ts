/**
 * Process items in batches of `batchSize`, running each batch in parallel.
 * Collects successes and failures separately so one bad item doesn't abort the rest.
 */
export async function batchPromises<T, R>(
  items: T[],
  operation: (item: T) => Promise<R>,
  batchSize = 5,
): Promise<{ results: R[]; errors: Error[] }> {
  const results: R[] = [];
  const errors: Error[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((item) =>
        operation(item).then(
          (result) => ({ result }),
          (error) => ({ error }),
        ),
      ),
    );

    for (const batchResult of batchResults) {
      if ('error' in batchResult) {
        errors.push(batchResult.error);
      } else {
        results.push(batchResult.result);
      }
    }
  }

  return { results, errors };
}

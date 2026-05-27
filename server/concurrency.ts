export async function withConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (!items.length) return;
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    let item: T | undefined;
    while ((item = queue.shift()) !== undefined) await fn(item);
  });
  await Promise.all(workers);
}

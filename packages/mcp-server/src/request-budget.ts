// Fixed memory, keyed by authenticated subject only. Untrusted IP/forwarded headers
// cannot grow the table or bypass a user's limit. The global bucket also bounds auth work.
export function createRequestBudget(
  limit: number,
  windowMs: number,
  maxKeys: number,
  now = Date.now,
) {
  if ([limit, windowMs, maxKeys].some((n) => !Number.isSafeInteger(n) || n < 1))
    throw new Error('Request limits must be positive integers');
  const buckets = new Map<string, { count: number; reset: number }>();
  return (key: string): number => {
    const time = now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.reset <= time) {
      for (const [id, entry] of buckets) if (entry.reset <= time) buckets.delete(id);
      if (!buckets.has(key) && buckets.size >= maxKeys) return Math.ceil(windowMs / 1000);
      bucket = { count: 0, reset: time + windowMs };
      buckets.set(key, bucket);
    }
    if (bucket.count >= limit) return Math.max(1, Math.ceil((bucket.reset - time) / 1000));
    bucket.count++;
    return 0;
  };
}

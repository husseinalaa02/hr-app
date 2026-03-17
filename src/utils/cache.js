/**
 * Tiny stale-while-revalidate cache for Supabase reads.
 * Data is returned from cache immediately; background refresh is triggered
 * when the TTL has expired. This makes navigating between pages feel instant.
 */

const store = new Map();

/**
 * @param {string}   key      - unique cache key
 * @param {function} fetcher  - async function that fetches fresh data
 * @param {number}   ttlMs    - how long cached data is considered fresh (default 60 s)
 */
export async function cached(key, fetcher, ttlMs = 60_000) {
  const entry = store.get(key);
  const now = Date.now();

  if (entry) {
    if (now - entry.ts < ttlMs) {
      // Fresh — return immediately
      return entry.data;
    }
    // Stale — return cached data now and refresh in background
    fetcher().then(data => store.set(key, { data, ts: Date.now() })).catch(() => {});
    return entry.data;
  }

  // Cache miss — fetch, store, return
  const data = await fetcher();
  store.set(key, { data, ts: now });
  return data;
}

/**
 * Remove all cache entries whose key starts with any of the given prefixes.
 * Call this after mutations so the next read fetches fresh data.
 */
export function invalidate(...prefixes) {
  for (const key of store.keys()) {
    if (prefixes.some(p => key.startsWith(p))) store.delete(key);
  }
}

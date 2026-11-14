import "server-only";

/**
 * In-memory guess limiter (one Node process serves the app). After FREE_TRIES wrong guesses the key
 * waits 30s, and each further wrong guess doubles the wait, up to 15 minutes. A right guess resets it.
 */

const FREE_TRIES = 5;
const FIRST_WAIT_MS = 30_000;
const MAX_WAIT_MS = 15 * 60_000;

interface Entry {
  fails: number;
  until: number;
}

const holder = globalThis as unknown as { __familychatLimits?: Map<string, Entry> };
const entries = (holder.__familychatLimits ??= new Map<string, Entry>());

/** Seconds the key must still wait, or 0. */
export function waitSeconds(key: string, now = Date.now()): number {
  const entry = entries.get(key);
  if (!entry || entry.until <= now) return 0;
  return Math.ceil((entry.until - now) / 1000);
}

export function recordFailure(key: string, now = Date.now()): void {
  const entry = entries.get(key) ?? { fails: 0, until: 0 };
  entry.fails += 1;
  if (entry.fails >= FREE_TRIES) {
    const wait = Math.min(FIRST_WAIT_MS * 2 ** (entry.fails - FREE_TRIES), MAX_WAIT_MS);
    entry.until = now + wait;
  }
  entries.set(key, entry);
  // Keep the map from growing without bound on a long-running process.
  if (entries.size > 5000) {
    for (const [k, e] of entries) if (e.until <= now && k !== key) entries.delete(k);
  }
}

export function recordSuccess(key: string): void {
  entries.delete(key);
}

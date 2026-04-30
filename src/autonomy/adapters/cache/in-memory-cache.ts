/**
 * In-memory LRU cache — default fallback when no external cache is configured.
 *
 * @module autonomy/adapters/cache/in-memory-cache
 */

import type { CacheAdapter, InMemoryCacheConfig } from "./types.js";

interface Entry<T = unknown> {
  value: T;
  expiresAt: number | null;
}

/**
 * Simple LRU cache backed by a Map (insertion-order iteration).
 * Evicts oldest entries when `maxEntries` is exceeded.
 */
export class InMemoryCache implements CacheAdapter {
  private readonly store = new Map<string, Entry>();
  private readonly maxEntries: number;

  constructor(config: InMemoryCacheConfig = {}) {
    this.maxEntries = config.maxEntries ?? 1000;
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // Move to end (most-recently used)
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value as T;
  }

  async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
    // Delete first so re-insertion moves to end
    this.store.delete(key);
    const expiresAt = ttlMs != null && ttlMs > 0 ? Date.now() + ttlMs : null;
    this.store.set(key, { value, expiresAt });
    this.evict();
  }

  async del(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async close(): Promise<void> {
    this.store.clear();
  }

  /** Current number of (possibly expired) entries. */
  get size(): number {
    return this.store.size;
  }

  private evict(): void {
    while (this.store.size > this.maxEntries) {
      const first = this.store.keys().next();
      if (first.done) break;
      this.store.delete(first.value);
    }
  }
}

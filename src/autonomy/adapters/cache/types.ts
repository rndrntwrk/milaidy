/**
 * Cache adapter interface — abstracts caching for autonomy kernel components.
 *
 * @module autonomy/adapters/cache/types
 */

/** Cache adapter interface. */
export interface CacheAdapter {
  /** Get a value by key. Returns undefined if not found or expired. */
  get<T = unknown>(key: string): Promise<T | undefined>;
  /** Set a value with optional TTL in milliseconds. */
  set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void>;
  /** Delete a key. Returns true if the key existed. */
  del(key: string): Promise<boolean>;
  /** Check if a key exists and is not expired. */
  has(key: string): Promise<boolean>;
  /** Clear all entries. */
  clear(): Promise<void>;
  /** Close the adapter and release resources. */
  close(): Promise<void>;
}

/** Configuration for in-memory cache. */
export interface InMemoryCacheConfig {
  /** Maximum number of entries. Oldest entries are evicted when exceeded. Default: 1000. */
  maxEntries?: number;
}

/** Configuration for Redis cache adapter. */
export interface RedisCacheConfig {
  /** Redis connection URL (e.g. redis://localhost:6379). */
  url: string;
  /** Key prefix for namespacing. Default: "autonomy:". */
  keyPrefix?: string;
  /** Default TTL in milliseconds if not specified per-set. */
  defaultTtlMs?: number;
}

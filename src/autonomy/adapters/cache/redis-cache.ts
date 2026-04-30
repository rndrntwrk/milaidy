/**
 * Redis cache adapter stub — optional external cache backend.
 *
 * Requires `ioredis` as an optional peer dependency. If the dependency
 * is not installed, construction throws with a clear message.
 *
 * @module autonomy/adapters/cache/redis-cache
 */

import type { CacheAdapter, RedisCacheConfig } from "./types.js";

/**
 * Redis-backed cache adapter.
 *
 * This is a structural stub — it defines the contract and delegates to
 * ioredis when available. Production usage requires installing ioredis.
 */
export class RedisCache implements CacheAdapter {
  private client: unknown;
  private readonly prefix: string;
  private readonly defaultTtlMs: number | undefined;

  constructor(private readonly config: RedisCacheConfig) {
    this.prefix = config.keyPrefix ?? "autonomy:";
    this.defaultTtlMs = config.defaultTtlMs;
    // Lazy-load ioredis — fail fast if not installed
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Redis = require("ioredis");
      this.client = new Redis(config.url);
    } catch {
      throw new Error(
        "RedisCache requires the 'ioredis' package. Install it with: npm install ioredis",
      );
    }
  }

  private key(k: string): string {
    return `${this.prefix}${k}`;
  }

  private redis(): { get: (k: string) => Promise<string | null>; set: (...args: unknown[]) => Promise<unknown>; del: (k: string) => Promise<number>; exists: (k: string) => Promise<number>; flushdb: () => Promise<unknown>; quit: () => Promise<unknown> } {
    return this.client as never;
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const raw = await this.redis().get(this.key(key));
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
    const ttl = ttlMs ?? this.defaultTtlMs;
    const serialized = JSON.stringify(value);
    if (ttl != null && ttl > 0) {
      await this.redis().set(this.key(key), serialized, "PX", ttl);
    } else {
      await this.redis().set(this.key(key), serialized);
    }
  }

  async del(key: string): Promise<boolean> {
    const count = await this.redis().del(this.key(key));
    return count > 0;
  }

  async has(key: string): Promise<boolean> {
    const count = await this.redis().exists(this.key(key));
    return count > 0;
  }

  async clear(): Promise<void> {
    await this.redis().flushdb();
  }

  async close(): Promise<void> {
    await this.redis().quit();
  }
}

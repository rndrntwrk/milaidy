/**
 * In-Memory Storage Backend — for testing only.
 *
 * Data does not persist across process restarts.
 * Never use in production.
 *
 * @module auth/backends/memory
 */

import type { SecureStorageBackend } from "../secure-storage.js";

export class MemoryBackend implements SecureStorageBackend {
  readonly name = "memory";
  readonly available = true;

  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  /** Clear all stored data (for testing). */
  clear(): void {
    this.store.clear();
  }
}

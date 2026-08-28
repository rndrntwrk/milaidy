export { AliceCoordinationLedger } from "./state-plane";
import type { CoordinationStorage } from "./state-plane";

type DurableStorageBinding = {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
};

export class DurableObjectCoordinationStorage implements CoordinationStorage {
  constructor(private readonly storage: DurableStorageBinding) {}

  get(key: string): Promise<unknown> {
    return this.storage.get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.storage.put(key, value);
  }
}

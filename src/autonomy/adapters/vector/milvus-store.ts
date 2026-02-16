/**
 * Milvus vector store stub — optional external vector database backend.
 *
 * Requires `@zilliz/milvus2-sdk-node` as an optional peer dependency.
 *
 * @module autonomy/adapters/vector/milvus-store
 */

import type { VectorStore, VectorDocument, VectorSearchResult, MilvusConfig } from "./types.js";

/**
 * Milvus-backed vector store stub.
 *
 * This is a structural stub — it defines the contract for integrating with
 * a running Milvus instance. Production usage requires @zilliz/milvus2-sdk-node
 * and a running Milvus server.
 */
export class MilvusVectorStore implements VectorStore {
  private client: unknown;
  private readonly config: MilvusConfig;

  constructor(config: MilvusConfig) {
    this.config = config;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { MilvusClient } = require("@zilliz/milvus2-sdk-node");
      this.client = new MilvusClient({ address: config.address });
    } catch {
      throw new Error(
        "MilvusVectorStore requires '@zilliz/milvus2-sdk-node'. Install it with: npm install @zilliz/milvus2-sdk-node",
      );
    }
  }

  async upsert(_documents: VectorDocument[]): Promise<void> {
    // Stub: In production, this would call:
    // await this.client.insert({
    //   collection_name: this.config.collection,
    //   data: documents.map(d => ({ id: d.id, vector: d.vector, ...d.metadata })),
    // });
    throw new Error("MilvusVectorStore.upsert() is a stub. Configure a running Milvus server.");
  }

  async search(_vector: number[], _topK: number): Promise<VectorSearchResult[]> {
    throw new Error("MilvusVectorStore.search() is a stub. Configure a running Milvus server.");
  }

  async delete(_ids: string[]): Promise<void> {
    throw new Error("MilvusVectorStore.delete() is a stub. Configure a running Milvus server.");
  }

  async get(_id: string): Promise<VectorDocument | undefined> {
    throw new Error("MilvusVectorStore.get() is a stub. Configure a running Milvus server.");
  }

  async count(): Promise<number> {
    throw new Error("MilvusVectorStore.count() is a stub. Configure a running Milvus server.");
  }

  async close(): Promise<void> {
    // Release client resources if connected
    this.client = null;
  }
}

/**
 * Vector store adapter interface — abstracts vector similarity search.
 *
 * @module autonomy/adapters/vector/types
 */

/** A document with its embedding vector. */
export interface VectorDocument {
  /** Unique document ID. */
  id: string;
  /** The embedding vector. */
  vector: number[];
  /** Optional metadata. */
  metadata?: Record<string, unknown>;
  /** Optional text content. */
  content?: string;
}

/** Search result with similarity score. */
export interface VectorSearchResult {
  /** The matched document. */
  document: VectorDocument;
  /** Similarity score (0-1, higher is more similar). */
  score: number;
}

/** Configuration for in-memory vector store. */
export interface InMemoryVectorConfig {
  /** Distance metric. Default: "cosine". */
  metric?: "cosine" | "euclidean" | "dot";
}

/** Configuration for Milvus vector store. */
export interface MilvusConfig {
  /** Milvus server address. */
  address: string;
  /** Collection name. */
  collection: string;
  /** Vector dimension. */
  dimension: number;
}

/** Vector store adapter interface. */
export interface VectorStore {
  /** Insert or update documents. */
  upsert(documents: VectorDocument[]): Promise<void>;
  /** Search for similar vectors. */
  search(vector: number[], topK: number): Promise<VectorSearchResult[]>;
  /** Delete documents by ID. */
  delete(ids: string[]): Promise<void>;
  /** Get a document by ID. */
  get(id: string): Promise<VectorDocument | undefined>;
  /** Count total documents. */
  count(): Promise<number>;
  /** Close the store and release resources. */
  close(): Promise<void>;
}

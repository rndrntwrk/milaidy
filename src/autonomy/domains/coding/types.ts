/**
 * Coding domain configuration types.
 *
 * @module autonomy/domains/coding/types
 */

/** Configuration options for the coding domain pack. */
export interface CodingDomainConfig {
  /** Whether file writes require explicit approval. */
  requireApprovalForWrites?: boolean;
  /** Maximum shell command timeout in milliseconds. */
  maxShellTimeoutMs?: number;
  /** Allowed file extensions for write operations. */
  allowedExtensions?: string[];
  /** Forbidden filesystem paths for write operations. */
  forbiddenPaths?: string[];
}

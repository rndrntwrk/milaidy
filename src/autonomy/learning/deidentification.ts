/**
 * De-identification and anonymization helpers for learning datasets.
 *
 * Applies deterministic pseudonymization to sensitive values so repeated
 * entities remain linkable without exposing raw identifiers.
 *
 * @module autonomy/learning/deidentification
 */

import { createHash } from "node:crypto";
import type { Episode, TrainingExample } from "./types.js";

export interface DeidentificationOptions {
  /** Salt used for deterministic pseudonym hashes. */
  salt?: string;
}

const EMAIL_PATTERN =
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_PATTERN = /\+?[0-9][0-9().\s-]{7,}[0-9]/g;
const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const SECRET_TOKEN_PATTERN = /\bsk-[A-Za-z0-9]{10,}\b/g;

const SECRET_FIELD_KEYS = new Set([
  "password",
  "passphrase",
  "token",
  "secret",
  "api_key",
  "apikey",
  "authorization",
  "auth",
]);

export class Deidentifier {
  private readonly salt: string;
  private readonly replacements = new Map<string, string>();

  constructor(options: DeidentificationOptions = {}) {
    this.salt = options.salt ?? "autonomy-learning";
  }

  private pseudonymize(kind: string, value: string): string {
    const key = `${kind}:${value}`;
    const existing = this.replacements.get(key);
    if (existing) return existing;

    const digest = createHash("sha256")
      .update(`${this.salt}:${key}`)
      .digest("hex")
      .slice(0, 10);
    const replacement = `<${kind}_${digest}>`;
    this.replacements.set(key, replacement);
    return replacement;
  }

  private isLikelyPhone(match: string): boolean {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) {
      return false;
    }
    const parts = match.split(".");
    if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part))) {
      return false;
    }
    return true;
  }

  deidentifyText(text: string): string {
    let out = text;
    out = out.replace(EMAIL_PATTERN, (match) => this.pseudonymize("EMAIL", match));
    out = out.replace(UUID_PATTERN, (match) => this.pseudonymize("UUID", match));
    out = out.replace(SECRET_TOKEN_PATTERN, (match) =>
      this.pseudonymize("SECRET", match),
    );
    out = out.replace(IPV4_PATTERN, (match) => this.pseudonymize("IP", match));
    out = out.replace(PHONE_PATTERN, (match) =>
      this.isLikelyPhone(match) ? this.pseudonymize("PHONE", match) : match,
    );
    return out;
  }

  deidentifyValue<T>(value: T, depth = 0): T {
    if (depth > 20) return value;
    if (typeof value === "string") {
      return this.deidentifyText(value) as T;
    }
    if (Array.isArray(value)) {
      return value.map((entry) => this.deidentifyValue(entry, depth + 1)) as T;
    }
    if (!value || typeof value !== "object") {
      return value;
    }

    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(input)) {
      const normalizedKey = key.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
      const isSecretField = SECRET_FIELD_KEYS.has(normalizedKey);

      if (typeof entryValue === "string") {
        output[key] = isSecretField
          ? this.pseudonymize("SECRET", entryValue)
          : this.deidentifyText(entryValue);
        continue;
      }

      output[key] = this.deidentifyValue(entryValue, depth + 1);
    }
    return output as T;
  }

  deidentifyEpisode(episode: Episode): Episode {
    return this.deidentifyValue(episode);
  }

  deidentifyEpisodes(episodes: Episode[]): Episode[] {
    return episodes.map((episode) => this.deidentifyEpisode(episode));
  }

  deidentifyExample(example: TrainingExample): TrainingExample {
    return this.deidentifyValue(example);
  }
}

export function deidentifyEpisodes(
  episodes: Episode[],
  options: DeidentificationOptions = {},
): Episode[] {
  return new Deidentifier(options).deidentifyEpisodes(episodes);
}

export function deidentifyExamples(
  examples: TrainingExample[],
  options: DeidentificationOptions = {},
): TrainingExample[] {
  const deidentifier = new Deidentifier(options);
  return examples.map((example) => deidentifier.deidentifyExample(example));
}

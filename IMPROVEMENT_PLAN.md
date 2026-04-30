# Milaidy Improvement Implementation Plan

**Version:** 1.0.0
**Created:** 2026-02-09
**Architecture Level:** Enterprise Production
**Reference Standards:** Claude Code Sandboxing, OpenAI Assistants Security, MCP Security Framework, OWASP, NIST

---

## Executive Summary

This document outlines a phased implementation plan to elevate Milaidy from its current alpha state to a production-ready, enterprise-grade AI agent runtime. The plan is organized into 5 phases over approximately 16-20 weeks, with each phase building upon the previous.

### Current State Assessment

| Area | Current State | Target State | Gap |
|------|---------------|--------------|-----|
| **Credential Storage** | Plaintext JSON on disk | Encrypted at rest + keychain | Critical |
| **Plugin Security** | No sandboxing, full Node.js access | Permission-based sandboxing | Critical |
| **Test Coverage** | 25% thresholds | 70% critical paths | High |
| **Process Isolation** | Single monolithic process | Worker-based isolation | High |
| **Observability** | Basic logging | Full OTEL stack | Medium |
| **Rate Limiting** | Pairing only (5/5min) | Global API rate limiting | Medium |

### Priority Matrix

```
                    IMPACT
                 High    Low
              ┌────────┬────────┐
        High  │  P0    │  P2    │
    URGENCY   ├────────┼────────┤
        Low   │  P1    │  P3    │
              └────────┴────────┘

P0: Security vulnerabilities (Phases 1-2)
P1: Architecture improvements (Phases 2-3)
P2: Integrations (Phase 4)
P3: DX improvements (Phase 5)
```

---

## Phase 1: Security Hardening Foundation (Weeks 1-4)

### 1.1 Credential Encryption at Rest

**Current State:** `src/auth/credentials.ts` stores credentials as plaintext JSON.

**Target Architecture:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    CREDENTIAL STORAGE LAYER                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  macOS      │    │  Linux      │    │  Windows    │         │
│  │  Keychain   │    │  libsecret  │    │  Credential │         │
│  │  (keytar)   │    │  (keytar)   │    │  Manager    │         │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │
│         │                  │                   │                 │
│         └──────────────────┼───────────────────┘                 │
│                            │                                     │
│                    ┌───────┴───────┐                            │
│                    │ SecureStorage │ (abstraction layer)        │
│                    │   Interface   │                            │
│                    └───────┬───────┘                            │
│                            │                                     │
│         ┌──────────────────┼──────────────────┐                 │
│         │                  │                  │                 │
│  ┌──────┴──────┐   ┌───────┴───────┐  ┌──────┴──────┐         │
│  │  Keychain   │   │  Encrypted    │  │   In-Memory │         │
│  │  Backend    │   │  File Backend │  │   (testing) │         │
│  │  (primary)  │   │  (fallback)   │  │             │         │
│  └─────────────┘   └───────────────┘  └─────────────┘         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation Files:**

```
src/auth/
├── credentials.ts          # Update: Add encryption layer
├── secure-storage.ts       # NEW: Abstract storage interface
├── backends/
│   ├── keychain.ts         # NEW: System keychain (keytar)
│   ├── encrypted-file.ts   # NEW: AES-256-GCM file encryption
│   └── memory.ts           # NEW: Testing backend
├── key-derivation.ts       # NEW: Machine-specific key derivation
└── migration.ts            # NEW: Migrate plaintext → encrypted
```

**Technical Specification:**

```typescript
// src/auth/secure-storage.ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { machineIdSync } from "node-machine-id";

export interface SecureStorageBackend {
  readonly name: string;
  readonly available: boolean;

  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
}

export interface EncryptedPayload {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;       // base64
  authTag: string;  // base64
  ciphertext: string; // base64
  keyDerivation: {
    algorithm: "scrypt";
    salt: string;   // base64
    N: number;      // cost factor
    r: number;      // block size
    p: number;      // parallelization
  };
}

// Key derivation using machine-specific entropy
function deriveKey(salt: Buffer): Buffer {
  const machineId = machineIdSync();
  const passphrase = `milaidy:${machineId}:${process.env.USER ?? "default"}`;

  return scryptSync(passphrase, salt, 32, {
    N: 2 ** 17,  // 128 MiB memory
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
  });
}

export function encrypt(plaintext: string): EncryptedPayload {
  const salt = randomBytes(32);
  const key = deriveKey(salt);
  const iv = randomBytes(12);  // 96-bit IV for GCM

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: encrypted.toString("base64"),
    keyDerivation: {
      algorithm: "scrypt",
      salt: salt.toString("base64"),
      N: 2 ** 17,
      r: 8,
      p: 1,
    },
  };
}

export function decrypt(payload: EncryptedPayload): string {
  if (payload.version !== 1) {
    throw new Error(`Unsupported encryption version: ${payload.version}`);
  }

  const salt = Buffer.from(payload.keyDerivation.salt, "base64");
  const key = deriveKey(salt);
  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
```

**Migration Strategy:**

```typescript
// src/auth/migration.ts
export async function migrateCredentials(): Promise<MigrationResult> {
  const legacyDir = path.join(MILAIDY_HOME, "auth");
  const result: MigrationResult = { migrated: [], failed: [], skipped: [] };

  for (const provider of ["anthropic-subscription", "openai-codex"]) {
    const legacyPath = path.join(legacyDir, `${provider}.json`);

    if (!fs.existsSync(legacyPath)) {
      result.skipped.push(provider);
      continue;
    }

    try {
      // 1. Read plaintext
      const plaintext = fs.readFileSync(legacyPath, "utf-8");
      const credentials = JSON.parse(plaintext);

      // 2. Validate structure
      if (!isValidCredentials(credentials)) {
        result.failed.push({ provider, error: "Invalid structure" });
        continue;
      }

      // 3. Save to secure storage
      await secureStorage.set(`credentials:${provider}`, JSON.stringify(credentials));

      // 4. Backup and remove plaintext (don't delete immediately)
      const backupPath = `${legacyPath}.migrated.${Date.now()}`;
      fs.renameSync(legacyPath, backupPath);

      // 5. Securely overwrite backup after verification
      const verified = await secureStorage.get(`credentials:${provider}`);
      if (verified) {
        secureOverwrite(backupPath);  // Zero-fill before delete
      }

      result.migrated.push(provider);
    } catch (err) {
      result.failed.push({ provider, error: String(err) });
    }
  }

  return result;
}
```

**Deliverables:**
- [ ] `SecureStorageBackend` interface and implementations
- [ ] Keychain integration via `keytar` package
- [ ] AES-256-GCM encrypted file fallback
- [ ] Machine-specific key derivation (non-exportable)
- [ ] Automatic migration from plaintext
- [ ] CLI command: `milaidy auth migrate`
- [ ] Unit tests with >90% coverage

**Dependencies:**
```json
{
  "keytar": "^7.9.0",
  "node-machine-id": "^1.1.12"
}
```

---

### 1.2 API Authentication Hardening

**Current State:** Basic token auth with timing-safe comparison, rate limiting only on pairing (5/5min).

**Target Architecture:**

```
                          ┌─────────────────────────────┐
                          │      INCOMING REQUEST       │
                          └─────────────┬───────────────┘
                                        │
                          ┌─────────────▼───────────────┐
                          │     RATE LIMITER LAYER      │
                          │  ┌───────────────────────┐  │
                          │  │ Token Bucket (global) │  │
                          │  │ 100 req/s burst       │  │
                          │  │ 20 req/s sustained    │  │
                          │  └───────────────────────┘  │
                          │  ┌───────────────────────┐  │
                          │  │ Per-IP Sliding Window │  │
                          │  │ 60 req/min            │  │
                          │  └───────────────────────┘  │
                          │  ┌───────────────────────┐  │
                          │  │ Per-Endpoint Limits   │  │
                          │  │ /api/chat: 10 req/min │  │
                          │  │ /api/query: 5 req/min │  │
                          │  └───────────────────────┘  │
                          └─────────────┬───────────────┘
                                        │
                          ┌─────────────▼───────────────┐
                          │    AUTHENTICATION LAYER     │
                          │  ┌───────────────────────┐  │
                          │  │ Token Extraction      │  │
                          │  │ - Bearer header       │  │
                          │  │ - X-Milaidy-Token     │  │
                          │  │ - Cookie (secure)     │  │
                          │  └───────────────────────┘  │
                          │  ┌───────────────────────┐  │
                          │  │ Token Validation      │  │
                          │  │ - Timing-safe compare │  │
                          │  │ - JWT verify (future) │  │
                          │  │ - Session lookup      │  │
                          │  └───────────────────────┘  │
                          └─────────────┬───────────────┘
                                        │
                          ┌─────────────▼───────────────┐
                          │    AUTHORIZATION LAYER      │
                          │  ┌───────────────────────┐  │
                          │  │ Permission Check      │  │
                          │  │ - Endpoint access     │  │
                          │  │ - Resource ownership  │  │
                          │  │ - Action capability   │  │
                          │  └───────────────────────┘  │
                          └─────────────┬───────────────┘
                                        │
                          ┌─────────────▼───────────────┐
                          │       REQUEST HANDLER       │
                          └─────────────────────────────┘
```

**Implementation:**

```typescript
// src/api/middleware/rate-limiter.ts
import { LRUCache } from "lru-cache";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator: (req: IncomingMessage) => string;
  skipSuccessfulRequests?: boolean;
  handler?: (req: IncomingMessage, res: ServerResponse) => void;
}

interface TokenBucketConfig {
  capacity: number;        // Max burst
  refillRate: number;      // Tokens per second
  refillInterval: number;  // Check interval ms
}

class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(private config: TokenBucketConfig) {
    this.tokens = config.capacity;
    this.lastRefill = Date.now();
  }

  tryConsume(count: number = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.config.capacity,
      this.tokens + elapsed * this.config.refillRate
    );
    this.lastRefill = now;
  }
}

class SlidingWindowRateLimiter {
  private windows = new LRUCache<string, number[]>({
    max: 100_000,  // Max tracked keys
    ttl: 3600_000, // 1 hour TTL
  });

  constructor(private config: RateLimitConfig) {}

  isAllowed(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Get existing timestamps, filter to current window
    const timestamps = (this.windows.get(key) ?? [])
      .filter(ts => ts > windowStart);

    const remaining = Math.max(0, this.config.maxRequests - timestamps.length);
    const resetAt = timestamps.length > 0
      ? timestamps[0] + this.config.windowMs
      : now + this.config.windowMs;

    if (timestamps.length >= this.config.maxRequests) {
      return { allowed: false, remaining: 0, resetAt };
    }

    timestamps.push(now);
    this.windows.set(key, timestamps);

    return { allowed: true, remaining: remaining - 1, resetAt };
  }
}

// Per-endpoint rate limits
const ENDPOINT_LIMITS: Record<string, RateLimitConfig> = {
  "/api/chat": { windowMs: 60_000, maxRequests: 10, keyGenerator: extractIP },
  "/api/database/query": { windowMs: 60_000, maxRequests: 5, keyGenerator: extractIP },
  "/api/auth/pair": { windowMs: 300_000, maxRequests: 5, keyGenerator: extractIP },
  "default": { windowMs: 60_000, maxRequests: 60, keyGenerator: extractIP },
};

export function createRateLimitMiddleware() {
  const globalBucket = new TokenBucket({ capacity: 100, refillRate: 20, refillInterval: 100 });
  const limiters = new Map<string, SlidingWindowRateLimiter>();

  for (const [endpoint, config] of Object.entries(ENDPOINT_LIMITS)) {
    limiters.set(endpoint, new SlidingWindowRateLimiter(config));
  }

  return (req: IncomingMessage, res: ServerResponse): boolean => {
    // 1. Global token bucket check
    if (!globalBucket.tryConsume()) {
      res.writeHead(503, { "Retry-After": "1" });
      res.end(JSON.stringify({ error: "Service temporarily overloaded" }));
      return false;
    }

    // 2. Per-endpoint sliding window
    const endpoint = req.url?.split("?")[0] ?? "default";
    const limiter = limiters.get(endpoint) ?? limiters.get("default")!;
    const key = limiter["config"].keyGenerator(req);

    const result = limiter.isAllowed(key);

    // Set rate limit headers (RFC 6585)
    res.setHeader("X-RateLimit-Limit", ENDPOINT_LIMITS[endpoint]?.maxRequests ?? 60);
    res.setHeader("X-RateLimit-Remaining", result.remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      res.writeHead(429, {
        "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
      });
      res.end(JSON.stringify({
        error: "Too many requests",
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
      }));
      return false;
    }

    return true;
  };
}
```

**Deliverables:**
- [ ] Token bucket for global burst protection
- [ ] Sliding window per-IP rate limiting
- [ ] Per-endpoint rate limit configuration
- [ ] Rate limit headers (RFC 6585)
- [ ] Configurable via `milaidy.json`
- [ ] Redis backend option for distributed deployments
- [ ] Bypass for local loopback connections

---

### 1.3 Pairing Security Enhancement

**Current State:** 6-digit numeric code, 5 attempts per 5 minutes.

**Improvements:**

```typescript
// src/api/pairing.ts
import { randomBytes, createHmac } from "crypto";
import { authenticator } from "otplib";

interface PairingSession {
  code: string;
  challenge: string;
  createdAt: number;
  expiresAt: number;
  attempts: number;
  maxAttempts: number;
  deviceFingerprint?: string;
}

// Use cryptographically secure code generation
function generatePairingCode(): string {
  // 8-character alphanumeric (excludes confusable: 0O1lI)
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const bytes = randomBytes(8);
  return Array.from(bytes)
    .map(b => alphabet[b % alphabet.length])
    .join("");
}

// Add challenge-response for device binding
function generateChallenge(): string {
  return randomBytes(32).toString("base64url");
}

// Verify pairing with device binding
async function verifyPairing(
  sessionId: string,
  code: string,
  challengeResponse: string,
  deviceFingerprint: string
): Promise<PairingResult> {
  const session = pairingSessions.get(sessionId);

  if (!session) {
    return { success: false, error: "Session not found" };
  }

  if (Date.now() > session.expiresAt) {
    pairingSessions.delete(sessionId);
    return { success: false, error: "Session expired" };
  }

  session.attempts++;

  if (session.attempts > session.maxAttempts) {
    pairingSessions.delete(sessionId);
    return { success: false, error: "Max attempts exceeded" };
  }

  // Timing-safe code comparison
  const codeMatch = timingSafeEqual(
    Buffer.from(session.code),
    Buffer.from(code.toUpperCase())
  );

  if (!codeMatch) {
    return { success: false, error: "Invalid code", attemptsRemaining: session.maxAttempts - session.attempts };
  }

  // Verify challenge-response (HMAC-based)
  const expectedResponse = createHmac("sha256", session.challenge)
    .update(deviceFingerprint)
    .digest("base64url");

  const challengeMatch = timingSafeEqual(
    Buffer.from(expectedResponse),
    Buffer.from(challengeResponse)
  );

  if (!challengeMatch) {
    return { success: false, error: "Challenge verification failed" };
  }

  // Bind device fingerprint for future verification
  session.deviceFingerprint = deviceFingerprint;

  // Generate long-lived token
  const token = generateSecureToken();

  // Store device authorization
  await deviceStore.authorize(deviceFingerprint, {
    token,
    createdAt: Date.now(),
    lastUsed: Date.now(),
  });

  pairingSessions.delete(sessionId);

  return { success: true, token };
}

// TOTP option for power users
function enableTOTP(secret: string, token: string): boolean {
  return authenticator.verify({ token, secret });
}
```

**Deliverables:**
- [ ] Alphanumeric codes (8 chars, no confusables)
- [ ] Challenge-response device binding
- [ ] Device fingerprint storage
- [ ] Optional TOTP for advanced users
- [ ] Pairing session expiry (5 minutes)
- [ ] Exponential backoff on failures

---

## Phase 2: Plugin Sandboxing (Weeks 5-8)

### 2.1 Plugin Permission System

**Reference:** Claude Code sandboxing architecture, MCP security framework.

**Permission Model:**

```typescript
// src/plugins/permissions.ts

export type PluginPermission =
  // Filesystem
  | "fs:read:workspace"      // Read workspace directory
  | "fs:read:home"           // Read home directory
  | "fs:read:system"         // Read system files
  | "fs:write:workspace"     // Write to workspace
  | "fs:write:temp"          // Write to temp directory
  | "fs:write:any"           // Write anywhere (dangerous)

  // Network
  | "net:outbound:https"     // HTTPS requests
  | "net:outbound:http"      // HTTP requests (insecure)
  | "net:outbound:websocket" // WebSocket connections
  | "net:inbound:listen"     // Listen on ports
  | "net:dns"                // DNS lookups

  // Process
  | "process:spawn"          // Spawn child processes
  | "process:shell"          // Execute shell commands
  | "process:env:read"       // Read environment variables
  | "process:env:write"      // Modify environment variables

  // System
  | "system:native"          // Native Node.js addons
  | "system:ffi"             // Foreign function interface
  | "system:gpu"             // GPU access

  // AI/Model
  | "ai:inference"           // Make AI API calls
  | "ai:embedding"           // Generate embeddings
  | "ai:training"            // Training operations

  // Data
  | "data:database"          // Database access
  | "data:memory"            // Agent memory access
  | "data:secrets"           // Access to secrets

export interface PluginManifest {
  name: string;
  version: string;
  description: string;

  permissions: {
    required: PluginPermission[];
    optional: PluginPermission[];
  };

  resourceLimits?: {
    maxMemoryMb?: number;
    maxCpuPercent?: number;
    maxNetworkBytesPerSecond?: number;
    maxFileHandles?: number;
  };

  isolation?: {
    level: "none" | "process" | "container" | "vm";
    network?: "host" | "restricted" | "none";
    filesystem?: "full" | "workspace" | "readonly" | "none";
  };

  integrity?: {
    checksums: Record<string, string>;  // file path → SHA-256
    signature?: string;                  // Ed25519 signature
    signedBy?: string;                   // Public key fingerprint
  };
}

// Permission check at runtime
export class PermissionGuard {
  constructor(
    private grantedPermissions: Set<PluginPermission>,
    private pluginName: string
  ) {}

  check(permission: PluginPermission): void {
    if (!this.grantedPermissions.has(permission)) {
      throw new PermissionDeniedError(
        `Plugin "${this.pluginName}" requires permission "${permission}" which was not granted`
      );
    }
  }

  async request(permission: PluginPermission, reason: string): Promise<boolean> {
    // Emit permission request event for user approval
    const approved = await this.emitPermissionRequest({
      plugin: this.pluginName,
      permission,
      reason,
    });

    if (approved) {
      this.grantedPermissions.add(permission);
    }

    return approved;
  }
}
```

### 2.2 Process Isolation via Worker Threads

**Architecture:**

```
┌─────────────────────────────────────────────────────────────────┐
│                      MAIN ORCHESTRATOR                           │
│                    (minimal footprint)                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Plugin Registry │ Worker Pool │ Message Router │ Supervisor ││
│  └─────────────────────────────────────────────────────────────┘│
└───────────────────────────┬─────────────────────────────────────┘
                            │ IPC (MessageChannel)
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ Plugin Worker │   │ Plugin Worker │   │ Plugin Worker │
│ ┌───────────┐ │   │ ┌───────────┐ │   │ ┌───────────┐ │
│ │ anthropic │ │   │ │ discord   │ │   │ │ custom    │ │
│ └───────────┘ │   │ └───────────┘ │   │ └───────────┘ │
│               │   │               │   │               │
│ Resource      │   │ Resource      │   │ Resource      │
│ Limits:       │   │ Limits:       │   │ Limits:       │
│ - 256MB heap  │   │ - 128MB heap  │   │ - 64MB heap   │
│ - 50% CPU     │   │ - 25% CPU     │   │ - 10% CPU     │
└───────────────┘   └───────────────┘   └───────────────┘
```

**Implementation:**

```typescript
// src/plugins/worker-pool.ts
import { Worker, MessageChannel, isMainThread, parentPort } from "worker_threads";

interface WorkerConfig {
  pluginPath: string;
  pluginName: string;
  permissions: PluginPermission[];
  resourceLimits: {
    maxYoungGenerationSizeMb: number;
    maxOldGenerationSizeMb: number;
    codeRangeSizeMb: number;
    stackSizeMb: number;
  };
}

class PluginWorkerPool {
  private workers = new Map<string, PluginWorker>();
  private messageHandlers = new Map<string, (msg: any) => void>();

  async spawn(config: WorkerConfig): Promise<PluginWorker> {
    const worker = new Worker(
      new URL("./plugin-worker-entry.js", import.meta.url),
      {
        workerData: {
          pluginPath: config.pluginPath,
          pluginName: config.pluginName,
          permissions: config.permissions,
        },
        resourceLimits: config.resourceLimits,
        // Security: Don't share environment by default
        env: this.buildSafeEnv(config.permissions),
      }
    );

    const pluginWorker = new PluginWorker(worker, config);

    // Health monitoring
    worker.on("error", (err) => this.handleWorkerError(config.pluginName, err));
    worker.on("exit", (code) => this.handleWorkerExit(config.pluginName, code));

    // Heartbeat
    pluginWorker.startHeartbeat(5000);

    this.workers.set(config.pluginName, pluginWorker);

    // Wait for worker ready signal
    await pluginWorker.waitReady(10000);

    return pluginWorker;
  }

  private buildSafeEnv(permissions: PluginPermission[]): Record<string, string> {
    const env: Record<string, string> = {
      NODE_ENV: process.env.NODE_ENV ?? "production",
    };

    // Only pass specific env vars based on permissions
    if (permissions.includes("process:env:read")) {
      // Still filter sensitive vars
      const allowedEnvPatterns = [
        /^LOG_LEVEL$/,
        /^DEBUG$/,
        /^TZ$/,
      ];

      for (const [key, value] of Object.entries(process.env)) {
        if (value && allowedEnvPatterns.some(p => p.test(key))) {
          env[key] = value;
        }
      }
    }

    return env;
  }

  private async handleWorkerError(name: string, error: Error): Promise<void> {
    logger.error(`[worker-pool] Plugin worker "${name}" error: ${error.message}`);

    // Emit event for monitoring
    eventBus.emit("plugin:error", { name, error });

    // Restart with exponential backoff
    const worker = this.workers.get(name);
    if (worker) {
      await worker.restart();
    }
  }

  private handleWorkerExit(name: string, code: number): void {
    logger.warn(`[worker-pool] Plugin worker "${name}" exited with code ${code}`);

    if (code !== 0) {
      // Unexpected exit - restart
      this.handleWorkerError(name, new Error(`Exit code ${code}`));
    }
  }
}

// Worker entry point
// src/plugins/plugin-worker-entry.ts
if (!isMainThread && parentPort) {
  const { pluginPath, pluginName, permissions } = workerData;

  // Create permission guard
  const guard = new PermissionGuard(new Set(permissions), pluginName);

  // Monkey-patch dangerous APIs based on permissions
  if (!permissions.includes("fs:read:system")) {
    patchFileSystem(guard);
  }
  if (!permissions.includes("net:outbound:https")) {
    patchNetwork(guard);
  }
  if (!permissions.includes("process:spawn")) {
    patchChildProcess(guard);
  }

  // Load plugin
  const plugin = await import(pluginPath);

  // Signal ready
  parentPort.postMessage({ type: "ready" });

  // Handle messages
  parentPort.on("message", async (msg) => {
    // ... handle plugin method calls
  });
}
```

### 2.3 Container-Based Isolation (Production)

For untrusted third-party plugins, use proper container isolation:

```typescript
// src/plugins/container-sandbox.ts
import Docker from "dockerode";

interface ContainerSandboxConfig {
  image: string;
  memoryLimit: string;      // e.g., "256m"
  cpuLimit: number;         // 0.5 = 50% of one core
  networkMode: "none" | "bridge" | "host";
  readOnlyRootfs: boolean;
  noNewPrivileges: boolean;
  capDrop: string[];        // Linux capabilities to drop
  seccompProfile: string;   // Seccomp profile path
}

const DEFAULT_CONTAINER_CONFIG: ContainerSandboxConfig = {
  image: "milaidy/plugin-sandbox:latest",
  memoryLimit: "256m",
  cpuLimit: 0.5,
  networkMode: "none",
  readOnlyRootfs: true,
  noNewPrivileges: true,
  capDrop: ["ALL"],
  seccompProfile: "./seccomp-plugin.json",
};

class ContainerSandbox {
  private docker: Docker;
  private container?: Docker.Container;

  async start(pluginPath: string, config: Partial<ContainerSandboxConfig> = {}): Promise<void> {
    const fullConfig = { ...DEFAULT_CONTAINER_CONFIG, ...config };

    this.container = await this.docker.createContainer({
      Image: fullConfig.image,
      Cmd: ["node", "--experimental-vm-modules", "/sandbox/runner.js"],
      HostConfig: {
        Memory: this.parseMemoryLimit(fullConfig.memoryLimit),
        NanoCpus: fullConfig.cpuLimit * 1e9,
        NetworkMode: fullConfig.networkMode,
        ReadonlyRootfs: fullConfig.readOnlyRootfs,
        SecurityOpt: [
          "no-new-privileges:true",
          `seccomp=${fullConfig.seccompProfile}`,
        ],
        CapDrop: fullConfig.capDrop,
        Binds: [
          `${pluginPath}:/plugin:ro`,
          `${this.workspaceDir}:/workspace:rw`,
        ],
        Tmpfs: {
          "/tmp": "rw,noexec,nosuid,size=64m",
        },
      },
      Env: [
        `PLUGIN_NAME=${this.pluginName}`,
        `MILAIDY_IPC_SOCKET=/ipc/plugin.sock`,
      ],
    });

    await this.container.start();
  }
}
```

**Deliverables:**
- [ ] `PluginManifest` schema with permission declarations
- [ ] Permission verification at load time
- [ ] Worker thread isolation for plugins
- [ ] API monkey-patching for permission enforcement
- [ ] Container sandbox for untrusted plugins
- [ ] Plugin signature verification (Ed25519)
- [ ] UI for permission approval

---

## Phase 3: Architecture Modernization (Weeks 9-12)

### 3.1 Event-Driven Architecture

**Current Problem:** Components directly call each other, creating tight coupling.

**Solution:** Centralized event bus with typed events.

```typescript
// src/events/event-bus.ts
import { EventEmitter } from "events";
import type { Redis } from "ioredis";

// Type-safe event definitions
export interface MilaidyEvents {
  // System lifecycle
  "system:startup": { version: string; startedAt: number };
  "system:shutdown": { reason: string; code: number };
  "system:config:changed": { path: string; oldValue: unknown; newValue: unknown };

  // Agent events
  "agent:message:received": {
    agentId: string;
    messageId: string;
    channel: string;
    content: string;
    metadata: Record<string, unknown>;
  };
  "agent:message:sent": {
    agentId: string;
    messageId: string;
    channel: string;
    content: string;
    tokens: { input: number; output: number };
    durationMs: number;
  };
  "agent:action:started": { agentId: string; action: string; params: unknown };
  "agent:action:completed": { agentId: string; action: string; result: unknown; durationMs: number };
  "agent:action:failed": { agentId: string; action: string; error: string };
  "agent:state:changed": { agentId: string; from: AgentState; to: AgentState };

  // Plugin events
  "plugin:loaded": { name: string; version: string; permissions: string[] };
  "plugin:unloaded": { name: string; reason: string };
  "plugin:error": { name: string; error: Error; recoverable: boolean };
  "plugin:permission:requested": { name: string; permission: string; reason: string };

  // Session events
  "session:created": { sessionId: string; channel: string; userId?: string };
  "session:message": { sessionId: string; role: "user" | "assistant"; content: string };
  "session:ended": { sessionId: string; reason: string; messageCount: number };

  // Security events
  "security:auth:success": { ip: string; method: string };
  "security:auth:failure": { ip: string; reason: string };
  "security:rate:exceeded": { ip: string; endpoint: string; limit: number };
  "security:permission:denied": { plugin: string; permission: string };
}

export class TypedEventBus {
  private emitter = new EventEmitter();
  private redis?: Redis;
  private subscriptions = new Map<string, Set<(...args: any[]) => void>>();

  constructor(redisUrl?: string) {
    this.emitter.setMaxListeners(100);

    if (redisUrl) {
      this.setupRedis(redisUrl);
    }
  }

  async emit<K extends keyof MilaidyEvents>(
    event: K,
    payload: MilaidyEvents[K]
  ): Promise<void> {
    const envelope = {
      event,
      payload,
      timestamp: Date.now(),
      source: process.pid,
    };

    // Local dispatch
    this.emitter.emit(event, payload);

    // Distributed dispatch
    if (this.redis) {
      await this.redis.publish(`milaidy:events:${event}`, JSON.stringify(envelope));
    }

    // Metrics
    metrics.counter("events.emitted", 1, { event });
  }

  on<K extends keyof MilaidyEvents>(
    event: K,
    handler: (payload: MilaidyEvents[K]) => void | Promise<void>
  ): () => void {
    const wrappedHandler = async (payload: MilaidyEvents[K]) => {
      const start = Date.now();
      try {
        await handler(payload);
        metrics.histogram("events.handler.duration", Date.now() - start, { event });
      } catch (err) {
        logger.error(`Event handler error for ${event}: ${err}`);
        metrics.counter("events.handler.errors", 1, { event });
      }
    };

    this.emitter.on(event, wrappedHandler);

    // Track for cleanup
    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, new Set());
    }
    this.subscriptions.get(event)!.add(wrappedHandler);

    // Return unsubscribe function
    return () => {
      this.emitter.off(event, wrappedHandler);
      this.subscriptions.get(event)?.delete(wrappedHandler);
    };
  }

  once<K extends keyof MilaidyEvents>(
    event: K,
    handler: (payload: MilaidyEvents[K]) => void | Promise<void>
  ): void {
    const wrappedHandler = async (payload: MilaidyEvents[K]) => {
      try {
        await handler(payload);
      } catch (err) {
        logger.error(`Event handler error for ${event}: ${err}`);
      }
    };

    this.emitter.once(event, wrappedHandler);
  }

  // Wait for an event with timeout
  async waitFor<K extends keyof MilaidyEvents>(
    event: K,
    timeoutMs: number = 30000,
    predicate?: (payload: MilaidyEvents[K]) => boolean
  ): Promise<MilaidyEvents[K]> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeoutMs);

      const handler = (payload: MilaidyEvents[K]) => {
        if (!predicate || predicate(payload)) {
          clearTimeout(timeout);
          resolve(payload);
        }
      };

      this.once(event, handler);
    });
  }
}

// Global singleton
export const eventBus = new TypedEventBus(process.env.REDIS_URL);
```

### 3.2 Dependency Injection Container

**Replace scattered `process.env` access with explicit injection:**

```typescript
// src/di/container.ts
import { Container, injectable, inject, interfaces } from "inversify";
import "reflect-metadata";

export const TYPES = {
  // Config
  Config: Symbol.for("Config"),
  ConfigWatcher: Symbol.for("ConfigWatcher"),

  // Core services
  EventBus: Symbol.for("EventBus"),
  Logger: Symbol.for("Logger"),
  Metrics: Symbol.for("Metrics"),

  // Data
  Database: Symbol.for("Database"),
  Cache: Symbol.for("Cache"),
  SecureStorage: Symbol.for("SecureStorage"),

  // Runtime
  AgentRuntime: Symbol.for("AgentRuntime"),
  PluginLoader: Symbol.for("PluginLoader"),
  PluginWorkerPool: Symbol.for("PluginWorkerPool"),

  // API
  ApiServer: Symbol.for("ApiServer"),
  WebSocketServer: Symbol.for("WebSocketServer"),

  // Auth
  AuthService: Symbol.for("AuthService"),
  RateLimiter: Symbol.for("RateLimiter"),
};

// Example injectable service
@injectable()
class AgentService {
  constructor(
    @inject(TYPES.Config) private config: MilaidyConfig,
    @inject(TYPES.Database) private db: DatabaseAdapter,
    @inject(TYPES.EventBus) private events: TypedEventBus,
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.Metrics) private metrics: MetricsClient,
  ) {}

  async processMessage(message: Message): Promise<Response> {
    this.metrics.counter("agent.messages", 1);
    const start = Date.now();

    try {
      // Use injected config instead of process.env
      const model = this.config.models?.large ?? "claude-sonnet-4-5";

      const response = await this.runtime.processMessage(message, { model });

      this.events.emit("agent:message:sent", {
        agentId: this.agentId,
        messageId: response.id,
        channel: message.channel,
        content: response.text,
        tokens: response.usage,
        durationMs: Date.now() - start,
      });

      return response;
    } catch (err) {
      this.logger.error("Message processing failed", { error: err, message });
      throw err;
    }
  }
}

// Container setup
export function createContainer(config: MilaidyConfig): Container {
  const container = new Container({ defaultScope: "Singleton" });

  // Bind config
  container.bind<MilaidyConfig>(TYPES.Config).toConstantValue(config);

  // Bind core services
  container.bind<TypedEventBus>(TYPES.EventBus).to(TypedEventBus);
  container.bind<Logger>(TYPES.Logger).toDynamicValue(() => createLogger(config.logging));
  container.bind<MetricsClient>(TYPES.Metrics).to(MetricsClient);

  // Bind data layer
  container.bind<DatabaseAdapter>(TYPES.Database).toDynamicValue((ctx) => {
    const cfg = ctx.container.get<MilaidyConfig>(TYPES.Config);
    return cfg.database?.provider === "postgres"
      ? new PostgresAdapter(cfg.database.postgres!)
      : new PgLiteAdapter(cfg.database?.pglite);
  });

  container.bind<SecureStorage>(TYPES.SecureStorage).to(SecureStorageService);

  // Bind API layer
  container.bind<ApiServer>(TYPES.ApiServer).to(ApiServer);

  return container;
}
```

### 3.3 Granular Config Hot Reload

**Replace full restart with targeted updates:**

```typescript
// src/config/config-watcher.ts
import { watch } from "chokidar";
import { diff } from "deep-object-diff";
import { debounce } from "lodash-es";

type ConfigPath = string;  // e.g., "models.large", "plugins.allow"

interface ConfigChangeHandler {
  path: ConfigPath | ConfigPath[];
  handler: (change: ConfigChange) => Promise<void>;
  restartRequired?: boolean;
}

interface ConfigChange {
  path: string;
  oldValue: unknown;
  newValue: unknown;
  fullConfig: MilaidyConfig;
}

class ConfigWatcher {
  private handlers: ConfigChangeHandler[] = [];
  private currentConfig: MilaidyConfig;
  private watcher?: FSWatcher;

  constructor(
    private configPath: string,
    private eventBus: TypedEventBus,
  ) {}

  // Register handler for specific config paths
  register(handler: ConfigChangeHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx !== -1) this.handlers.splice(idx, 1);
    };
  }

  async start(): Promise<void> {
    this.currentConfig = await loadMilaidyConfig();

    this.watcher = watch(this.configPath, {
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher.on("change", debounce(async () => {
      await this.handleConfigChange();
    }, 300));
  }

  private async handleConfigChange(): Promise<void> {
    try {
      const newConfig = await loadMilaidyConfig();
      const changes = this.computeChanges(this.currentConfig, newConfig);

      if (changes.length === 0) return;

      logger.info(`[config-watcher] Detected ${changes.length} config changes`);

      // Group handlers by restart requirement
      const hotReloadable: Array<{ handler: ConfigChangeHandler; change: ConfigChange }> = [];
      const requiresRestart: string[] = [];

      for (const change of changes) {
        const matchingHandlers = this.handlers.filter(h =>
          this.pathMatches(change.path, h.path)
        );

        for (const handler of matchingHandlers) {
          if (handler.restartRequired) {
            requiresRestart.push(change.path);
          } else {
            hotReloadable.push({ handler, change });
          }
        }
      }

      // Execute hot-reloadable handlers
      for (const { handler, change } of hotReloadable) {
        try {
          await handler.handler(change);
          this.eventBus.emit("system:config:changed", {
            path: change.path,
            oldValue: change.oldValue,
            newValue: change.newValue,
          });
        } catch (err) {
          logger.error(`[config-watcher] Handler failed for ${change.path}:`, err);
        }
      }

      // Warn about restart-required changes
      if (requiresRestart.length > 0) {
        logger.warn(
          `[config-watcher] The following changes require restart: ${requiresRestart.join(", ")}`
        );
      }

      this.currentConfig = newConfig;
    } catch (err) {
      logger.error("[config-watcher] Failed to process config change:", err);
    }
  }

  private computeChanges(oldConfig: MilaidyConfig, newConfig: MilaidyConfig): ConfigChange[] {
    const rawDiff = diff(oldConfig, newConfig);
    return this.flattenDiff(rawDiff, "", oldConfig, newConfig);
  }

  private flattenDiff(
    diffObj: object,
    prefix: string,
    oldConfig: MilaidyConfig,
    newConfig: MilaidyConfig
  ): ConfigChange[] {
    const changes: ConfigChange[] = [];

    for (const [key, value] of Object.entries(diffObj)) {
      const path = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === "object" && !Array.isArray(value)) {
        changes.push(...this.flattenDiff(value, path, oldConfig, newConfig));
      } else {
        changes.push({
          path,
          oldValue: this.getPath(oldConfig, path),
          newValue: this.getPath(newConfig, path),
          fullConfig: newConfig,
        });
      }
    }

    return changes;
  }
}

// Usage
configWatcher.register({
  path: "models.large",
  handler: async (change) => {
    logger.info(`Switching large model from ${change.oldValue} to ${change.newValue}`);
    await runtime.updateModelConfig({ large: change.newValue as string });
  },
});

configWatcher.register({
  path: "channels.discord",
  handler: async (change) => {
    if (!change.oldValue && change.newValue) {
      await runtime.startPlugin("@elizaos/plugin-discord");
    } else if (change.oldValue && !change.newValue) {
      await runtime.stopPlugin("@elizaos/plugin-discord");
    } else {
      await runtime.restartPlugin("@elizaos/plugin-discord");
    }
  },
});

configWatcher.register({
  path: ["database.provider", "database.postgres"],
  handler: async () => {},
  restartRequired: true,  // Database changes require restart
});
```

---

## Phase 4: Observability & Integrations (Weeks 13-16)

### 4.1 OpenTelemetry Integration

```typescript
// src/telemetry/setup.ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";

export function initTelemetry(config: MilaidyConfig): NodeSDK {
  const otelConfig = config.diagnostics?.otel;

  if (!otelConfig?.enabled) {
    return new NodeSDK({ autoDetectResources: false });
  }

  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: "milaidy",
    [SemanticResourceAttributes.SERVICE_VERSION]: pkg.version,
    [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: process.env.HOSTNAME ?? os.hostname(),
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? "production",
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${otelConfig.endpoint}/v1/traces`,
    headers: otelConfig.headers,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${otelConfig.endpoint}/v1/metrics`,
    headers: otelConfig.headers,
  });

  const logExporter = new OTLPLogExporter({
    url: `${otelConfig.endpoint}/v1/logs`,
    headers: otelConfig.headers,
  });

  const sdk = new NodeSDK({
    resource,
    spanProcessor: new BatchSpanProcessor(traceExporter, {
      maxQueueSize: 2048,
      maxExportBatchSize: 512,
      scheduledDelayMillis: 5000,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: otelConfig.flushIntervalMs ?? 10000,
    }),
    logRecordProcessor: new BatchLogRecordProcessor(logExporter),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-http": {
          ignoreIncomingPaths: ["/health", "/metrics"],
        },
      }),
      // Custom agent instrumentation
      new AgentInstrumentation(),
    ],
  });

  sdk.start();

  // Graceful shutdown
  process.on("SIGTERM", () => {
    sdk.shutdown()
      .then(() => logger.info("Telemetry shutdown complete"))
      .catch((err) => logger.error("Telemetry shutdown error:", err));
  });

  return sdk;
}

// Custom instrumentation for agent operations
class AgentInstrumentation {
  private tracer = trace.getTracer("milaidy-agent");
  private meter = metrics.getMeter("milaidy-agent");

  // Counters
  private messagesTotal = this.meter.createCounter("milaidy.messages.total", {
    description: "Total messages processed",
  });

  private tokensTotal = this.meter.createCounter("milaidy.tokens.total", {
    description: "Total tokens used",
  });

  private actionsTotal = this.meter.createCounter("milaidy.actions.total", {
    description: "Total actions executed",
  });

  // Histograms
  private turnDuration = this.meter.createHistogram("milaidy.turn.duration", {
    description: "Agent turn duration in milliseconds",
    unit: "ms",
  });

  private responseTokens = this.meter.createHistogram("milaidy.response.tokens", {
    description: "Tokens per response",
  });

  // Gauges
  private activeSessions = this.meter.createUpDownCounter("milaidy.sessions.active", {
    description: "Number of active sessions",
  });

  wrapProcessMessage<T>(
    agentId: string,
    message: Message,
    fn: () => Promise<T>
  ): Promise<T> {
    return this.tracer.startActiveSpan(
      "agent.processMessage",
      {
        attributes: {
          "agent.id": agentId,
          "message.channel": message.channel,
          "message.length": message.text.length,
        },
      },
      async (span) => {
        this.messagesTotal.add(1, { agent: agentId, channel: message.channel });
        const start = Date.now();

        try {
          const result = await fn();

          const duration = Date.now() - start;
          this.turnDuration.record(duration, { agent: agentId });

          if (result && typeof result === "object" && "usage" in result) {
            const usage = (result as any).usage;
            this.tokensTotal.add(usage.totalTokens, { agent: agentId });
            this.responseTokens.record(usage.totalTokens, { agent: agentId });

            span.setAttributes({
              "response.tokens.input": usage.inputTokens,
              "response.tokens.output": usage.outputTokens,
              "response.duration_ms": duration,
            });
          }

          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
          throw err;
        } finally {
          span.end();
        }
      }
    );
  }
}
```

### 4.2 Health Check Endpoints

```typescript
// src/api/health.ts
import os from "os";

interface HealthCheck {
  name: string;
  check: () => Promise<CheckResult>;
  critical: boolean;
  timeoutMs?: number;
}

interface CheckResult {
  healthy: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  uptime: number;
  timestamp: string;
  checks: Array<{
    name: string;
    healthy: boolean;
    critical: boolean;
    message?: string;
    durationMs: number;
    details?: Record<string, unknown>;
  }>;
  system?: {
    memory: {
      heapUsed: number;
      heapTotal: number;
      rss: number;
      external: number;
    };
    cpu: {
      user: number;
      system: number;
    };
    loadAvg: number[];
  };
}

const healthChecks: HealthCheck[] = [
  {
    name: "database",
    critical: true,
    timeoutMs: 5000,
    check: async () => {
      try {
        const start = Date.now();
        await db.query("SELECT 1");
        return {
          healthy: true,
          details: { latencyMs: Date.now() - start },
        };
      } catch (err) {
        return {
          healthy: false,
          message: String(err),
        };
      }
    },
  },
  {
    name: "model_provider",
    critical: true,
    timeoutMs: 10000,
    check: async () => {
      try {
        // Light API ping - don't actually generate tokens
        const provider = config.models?.large?.split("/")[0] ?? "anthropic";
        const response = await fetch(`${getProviderUrl(provider)}/models`, {
          headers: { Authorization: `Bearer ${getApiKey(provider)}` },
          signal: AbortSignal.timeout(5000),
        });
        return {
          healthy: response.ok,
          details: { provider, statusCode: response.status },
        };
      } catch (err) {
        return {
          healthy: false,
          message: String(err),
        };
      }
    },
  },
  {
    name: "memory",
    critical: false,
    check: async () => {
      const usage = process.memoryUsage();
      const heapUsedMb = usage.heapUsed / 1024 / 1024;
      const threshold = 1024;  // 1GB warning threshold

      return {
        healthy: heapUsedMb < threshold,
        message: heapUsedMb >= threshold
          ? `Heap usage ${heapUsedMb.toFixed(0)}MB exceeds ${threshold}MB`
          : undefined,
        details: {
          heapUsedMb: Math.round(heapUsedMb),
          heapTotalMb: Math.round(usage.heapTotal / 1024 / 1024),
          rssMb: Math.round(usage.rss / 1024 / 1024),
        },
      };
    },
  },
  {
    name: "disk",
    critical: false,
    check: async () => {
      const statfs = await fs.statfs(MILAIDY_HOME);
      const freeGb = (statfs.bfree * statfs.bsize) / 1024 / 1024 / 1024;
      const threshold = 1;  // 1GB warning threshold

      return {
        healthy: freeGb > threshold,
        message: freeGb <= threshold
          ? `Only ${freeGb.toFixed(1)}GB disk space remaining`
          : undefined,
        details: { freeGb: Math.round(freeGb * 10) / 10 },
      };
    },
  },
  {
    name: "plugins",
    critical: false,
    check: async () => {
      const loaded = runtime?.getLoadedPlugins() ?? [];
      const failed = runtime?.getFailedPlugins() ?? [];

      return {
        healthy: failed.length === 0,
        message: failed.length > 0
          ? `${failed.length} plugins failed to load`
          : undefined,
        details: {
          loaded: loaded.length,
          failed: failed.length,
          failedNames: failed.map(p => p.name),
        },
      };
    },
  },
];

async function runHealthChecks(detailed: boolean = false): Promise<HealthResponse> {
  const results = await Promise.all(
    healthChecks.map(async (check) => {
      const start = Date.now();
      try {
        const result = await Promise.race([
          check.check(),
          new Promise<CheckResult>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), check.timeoutMs ?? 5000)
          ),
        ]);

        return {
          name: check.name,
          healthy: result.healthy,
          critical: check.critical,
          message: result.message,
          durationMs: Date.now() - start,
          details: detailed ? result.details : undefined,
        };
      } catch (err) {
        return {
          name: check.name,
          healthy: false,
          critical: check.critical,
          message: String(err),
          durationMs: Date.now() - start,
        };
      }
    })
  );

  const criticalFailed = results.some(r => r.critical && !r.healthy);
  const anyFailed = results.some(r => !r.healthy);

  const response: HealthResponse = {
    status: criticalFailed ? "unhealthy" : anyFailed ? "degraded" : "healthy",
    version: pkg.version,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: results,
  };

  if (detailed) {
    const cpuUsage = process.cpuUsage();
    response.system = {
      memory: process.memoryUsage(),
      cpu: {
        user: cpuUsage.user / 1000000,  // Convert to seconds
        system: cpuUsage.system / 1000000,
      },
      loadAvg: os.loadavg(),
    };
  }

  return response;
}

// Endpoints
// GET /health/live - Kubernetes liveness probe
app.get("/health/live", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// GET /health/ready - Kubernetes readiness probe
app.get("/health/ready", async (req, res) => {
  const health = await runHealthChecks(false);
  const statusCode = health.status === "unhealthy" ? 503 : 200;
  res.status(statusCode).json(health);
});

// GET /health - Full health check with optional details
app.get("/health", async (req, res) => {
  const detailed = req.query.detailed === "true";
  const health = await runHealthChecks(detailed);
  const statusCode = health.status === "unhealthy" ? 503 : 200;
  res.status(statusCode).json(health);
});
```

### 4.3 Structured Logging

```typescript
// src/logging/logger.ts
import pino from "pino";
import { AsyncLocalStorage } from "async_hooks";

// Request context for correlation
interface RequestContext {
  requestId: string;
  sessionId?: string;
  agentId?: string;
  userId?: string;
  channel?: string;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export function createLogger(config?: LoggingConfig): pino.Logger {
  const logger = pino({
    level: config?.level ?? "info",

    formatters: {
      level: (label) => ({ level: label }),
      bindings: () => ({
        pid: process.pid,
        hostname: os.hostname(),
        version: pkg.version,
      }),
    },

    // Automatic context injection
    mixin: () => {
      const ctx = asyncLocalStorage.getStore();
      return ctx ? { ...ctx } : {};
    },

    // Sensitive data redaction
    redact: {
      paths: [
        "*.password",
        "*.apiKey",
        "*.api_key",
        "*.token",
        "*.secret",
        "*.privateKey",
        "*.private_key",
        "headers.authorization",
        "headers.x-api-key",
        "req.headers.authorization",
        "req.headers.cookie",
      ],
      censor: "[REDACTED]",
    },

    // Serializers for common objects
    serializers: {
      err: pino.stdSerializers.err,
      req: (req) => ({
        method: req.method,
        url: req.url,
        headers: {
          "content-type": req.headers["content-type"],
          "user-agent": req.headers["user-agent"],
        },
        remoteAddress: req.socket?.remoteAddress,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },

    // Pretty printing in development
    transport: process.env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  });

  return logger;
}

// Run function with request context
export function withContext<T>(ctx: RequestContext, fn: () => T): T {
  return asyncLocalStorage.run(ctx, fn);
}

// Middleware to inject request context
export function requestContextMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
): void {
  const requestId = req.headers["x-request-id"] as string
    ?? crypto.randomUUID();

  res.setHeader("x-request-id", requestId);

  const ctx: RequestContext = {
    requestId,
    sessionId: req.headers["x-session-id"] as string,
  };

  asyncLocalStorage.run(ctx, next);
}

// Usage
const logger = createLogger(config.logging);

logger.info({ endpoint: "/api/chat", tokens: 150 }, "Message processed");
// Output: {"level":"info","time":1707480000000,"requestId":"abc-123","endpoint":"/api/chat","tokens":150,"msg":"Message processed"}
```

---

## Phase 5: Testing & DX (Weeks 17-20)

### 5.1 Increase Test Coverage

**Target:** 70% coverage on critical paths.

```typescript
// vitest.config.ts updates
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
      include: [
        "src/runtime/**/*.ts",
        "src/api/**/*.ts",
        "src/auth/**/*.ts",
        "src/plugins/**/*.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
        "**/types.ts",
        "**/types/**",
      ],
    },
  },
});
```

### 5.2 E2E Test Framework

```typescript
// test/e2e/framework/harness.ts
import { spawn, ChildProcess } from "child_process";
import { createClient } from "./api-client";

export interface TestHarnessConfig {
  config: Partial<MilaidyConfig>;
  env?: Record<string, string>;
  timeout?: number;
  port?: number;
}

export class MilaidyTestHarness {
  private process?: ChildProcess;
  private client: ApiClient;
  private tempConfigPath?: string;

  static async start(config: TestHarnessConfig): Promise<MilaidyTestHarness> {
    const harness = new MilaidyTestHarness();
    await harness.initialize(config);
    return harness;
  }

  private async initialize(config: TestHarnessConfig): Promise<void> {
    const port = config.port ?? await getRandomPort();

    // Write temp config
    this.tempConfigPath = path.join(os.tmpdir(), `milaidy-test-${Date.now()}.json`);
    await fs.writeFile(this.tempConfigPath, JSON.stringify({
      ...config.config,
      gateway: { port },
    }));

    // Start milaidy process
    this.process = spawn("node", ["./dist/entry.js", "start"], {
      env: {
        ...process.env,
        ...config.env,
        MILAIDY_CONFIG: this.tempConfigPath,
        MILAIDY_PORT: String(port),
        LOG_LEVEL: "error",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Wait for ready
    await this.waitForReady(config.timeout ?? 30000);

    // Create API client
    this.client = createClient(`http://localhost:${port}`);
  }

  private async waitForReady(timeout: number): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      try {
        const status = await this.client.getStatus();
        if (status.state === "running") return;
      } catch {
        // Not ready yet
      }
      await sleep(500);
    }

    throw new Error("Harness failed to start within timeout");
  }

  async sendMessage(text: string): Promise<MessageResponse> {
    return this.client.chat({ text });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill("SIGTERM");
      await new Promise(resolve => this.process?.on("exit", resolve));
    }

    if (this.tempConfigPath) {
      await fs.unlink(this.tempConfigPath).catch(() => {});
    }
  }

  get agentName(): string {
    return this.client.agentName;
  }
}

// Example test
// test/e2e/agent-flow.test.ts
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { MilaidyTestHarness } from "./framework/harness";

describe("Agent Conversation Flow", () => {
  let harness: MilaidyTestHarness;

  beforeAll(async () => {
    harness = await MilaidyTestHarness.start({
      config: {
        models: { large: "mock" },
        plugins: { allow: ["@elizaos/plugin-sql", "@elizaos/plugin-mock-llm"] },
      },
      timeout: 60000,
    });
  }, 120000);

  afterAll(async () => {
    await harness.stop();
  });

  test("should respond to greeting", async () => {
    const response = await harness.sendMessage("Hello!");

    expect(response.text).toBeTruthy();
    expect(response.text.length).toBeGreaterThan(0);
  });

  test("should maintain conversation context", async () => {
    await harness.sendMessage("My name is Alice.");
    const response = await harness.sendMessage("What's my name?");

    expect(response.text.toLowerCase()).toContain("alice");
  });

  test("should execute tool calls", async () => {
    const response = await harness.sendMessage("What time is it?");

    expect(response.toolCalls).toBeDefined();
    expect(response.toolCalls?.some(t => t.name === "get_current_time")).toBe(true);
  });
});
```

---

## Implementation Timeline

```
Week 1-2:   Credential encryption + migration
Week 3-4:   Rate limiting + auth hardening
Week 5-6:   Plugin permission system
Week 7-8:   Worker thread isolation
Week 9-10:  Event bus + DI container
Week 11-12: Config hot reload
Week 13-14: OpenTelemetry integration
Week 15-16: Health checks + structured logging
Week 17-18: Test coverage increase
Week 19-20: E2E framework + documentation
```

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Test Coverage | 25% | 70% | `vitest --coverage` |
| Security Score | N/A | A+ | OWASP ZAP scan |
| MTTR (Mean Time to Recovery) | Unknown | <5 min | Health check latency |
| Plugin Isolation | None | Process-level | Worker thread usage |
| Credential Security | Plaintext | Encrypted | Audit of storage |
| API Response Time (p99) | Unknown | <500ms | OTEL metrics |

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking changes to config schema | High | Medium | Versioned schema + migration |
| Worker thread overhead | Medium | Low | Benchmark before/after |
| Keychain unavailability | Low | Medium | Encrypted file fallback |
| Plugin compatibility breakage | High | High | Gradual rollout + allow-list |

---

## Appendix A: File Changes Summary

### New Files
```
src/auth/
├── secure-storage.ts
├── backends/
│   ├── keychain.ts
│   ├── encrypted-file.ts
│   └── memory.ts
├── key-derivation.ts
└── migration.ts

src/plugins/
├── permissions.ts
├── worker-pool.ts
├── plugin-worker-entry.ts
├── container-sandbox.ts
└── manifest-validator.ts

src/events/
└── event-bus.ts

src/di/
└── container.ts

src/api/middleware/
├── rate-limiter.ts
├── request-context.ts
└── security-headers.ts

src/api/
└── health.ts

src/telemetry/
├── setup.ts
├── agent-instrumentation.ts
└── custom-metrics.ts

src/logging/
└── logger.ts

src/config/
└── config-watcher.ts

test/e2e/framework/
├── harness.ts
├── api-client.ts
└── fixtures/
```

### Modified Files
```
src/auth/credentials.ts          # Add encryption layer
src/runtime/eliza.ts             # Plugin permission checks
src/api/server.ts                # Add middleware chain
package.json                     # New dependencies
tsconfig.json                    # Decorator support
vitest.config.ts                 # Coverage thresholds
```

## Appendix B: New Dependencies

```json
{
  "dependencies": {
    "keytar": "^7.9.0",
    "node-machine-id": "^1.1.12",
    "inversify": "^6.0.2",
    "reflect-metadata": "^0.2.1",
    "pino": "^8.19.0",
    "pino-pretty": "^10.3.1",
    "lru-cache": "^10.2.0",
    "deep-object-diff": "^1.1.9",
    "chokidar": "^3.6.0",
    "dockerode": "^4.0.2",
    "otplib": "^12.0.1"
  },
  "devDependencies": {
    "@opentelemetry/sdk-node": "^0.49.1",
    "@opentelemetry/auto-instrumentations-node": "^0.44.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.49.1",
    "@opentelemetry/exporter-metrics-otlp-http": "^0.49.1",
    "@opentelemetry/exporter-logs-otlp-http": "^0.49.1"
  }
}
```

---

**Document Version:** 1.0.0
**Last Updated:** 2026-02-09
**Authors:** Claude Code Architecture Team
**Review Status:** Draft

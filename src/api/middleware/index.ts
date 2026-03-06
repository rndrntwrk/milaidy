/**
 * API Middleware — security and request processing middleware.
 *
 * @module api/middleware
 */

export {
  createRateLimitMiddleware,
  ENDPOINT_LIMITS,
  extractIP,
  type RateLimitConfig,
  type RateLimiterOptions,
  type RateLimitMiddleware,
  type RateLimitResult,
  SlidingWindowRateLimiter,
  TokenBucket,
  type TokenBucketConfig,
} from "./rate-limiter.js";

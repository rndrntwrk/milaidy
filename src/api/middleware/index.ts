/**
 * API Middleware — security and request processing middleware.
 *
 * @module api/middleware
 */

export {
  createRateLimitMiddleware,
  extractIP,
  ENDPOINT_LIMITS,
  TokenBucket,
  SlidingWindowRateLimiter,
  type RateLimitConfig,
  type RateLimitResult,
  type RateLimiterOptions,
  type RateLimitMiddleware,
  type TokenBucketConfig,
} from "./rate-limiter.js";

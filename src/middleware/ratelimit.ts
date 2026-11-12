import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';

/**
 * Simple in-memory rate limiter for development/testing.
 * For production, use Cloudflare Rate Limiting or Durable Objects.
 * 
 * This implementation tracks requests by user ID and IP address.
 */

interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
  keyPrefix: string;  // Prefix for identifying different limits
}

// In-memory store (use Cloudflare KV or Durable Objects in production)
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function getRateLimitKey(userId: string | undefined, ip: string | undefined, prefix: string): string {
  return `${prefix}:${userId || ip || 'anonymous'}`;
}

function checkRateLimit(key: string, config: RateLimitConfig): { allowed: boolean; resetAt: number; remaining: number } {
  const now = Date.now();
  const entry = requestCounts.get(key);

  // No entry or window expired - allow and create new entry
  if (!entry || entry.resetAt < now) {
    const resetAt = now + config.windowMs;
    requestCounts.set(key, { count: 1, resetAt });
    return { allowed: true, resetAt, remaining: config.maxRequests - 1 };
  }

  // Within window - check limit
  if (entry.count >= config.maxRequests) {
    return { allowed: false, resetAt: entry.resetAt, remaining: 0 };
  }

  // Increment and allow
  entry.count++;
  requestCounts.set(key, entry);
  return { allowed: true, resetAt: entry.resetAt, remaining: config.maxRequests - entry.count };
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requestCounts.entries()) {
    if (entry.resetAt < now) {
      requestCounts.delete(key);
    }
  }
}, 60000); // Clean every minute

/**
 * Create a rate limiting middleware with custom configuration
 */
export function createRateLimiter(config: RateLimitConfig): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const userId = c.get('user')?.id;
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For');
    const key = getRateLimitKey(userId, ip, config.keyPrefix);

    const result = checkRateLimit(key, config);

    // Add rate limit headers
    c.header('X-RateLimit-Limit', config.maxRequests.toString());
    c.header('X-RateLimit-Remaining', result.remaining.toString());
    c.header('X-RateLimit-Reset', Math.floor(result.resetAt / 1000).toString());

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
      c.header('Retry-After', retryAfter.toString());
      return c.json({
        error: 'Rate limit exceeded',
        retryAfter: retryAfter
      }, 429);
    }

    await next();
  };
}

// Preset rate limiters for common operations

/**
 * General API rate limit: 100 requests per minute per user
 */
export const generalRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  keyPrefix: 'general'
});

/**
 * Post creation: 10 posts per hour per user
 */
export const postCreationLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  keyPrefix: 'post-create'
});

/**
 * Connection requests: 20 per hour per user
 */
export const connectionRequestLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 20,
  keyPrefix: 'connection-request'
});

/**
 * Messages: 60 per minute per user
 */
export const messageLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,
  keyPrefix: 'message'
});

/**
 * Reports: 10 per hour per user
 */
export const reportLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  keyPrefix: 'report'
});

/**
 * Upload signing: 20 per hour per user
 */
export const uploadSignLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 20,
  keyPrefix: 'upload-sign'
});

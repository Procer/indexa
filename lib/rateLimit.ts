import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// Mismo guard que lib/search/cache.ts: si no hay credenciales de Upstash
// configuradas (ej. entorno local sin .env.local completo), el rate
// limiting se desactiva en vez de romper el endpoint.
const redisAvailable = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = redisAvailable ? Redis.fromEnv() : null;

const limiters = new Map<string, Ratelimit>();

function getLimiter(prefix: string, requests: number, windowSeconds: number): Ratelimit | null {
  if (!redis) return null;
  const cacheKey = `${prefix}:${requests}:${windowSeconds}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(requests, `${windowSeconds} s`),
      prefix: `ratelimit:${prefix}`,
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

// Sin Upstash configurado, siempre permite (mismo criterio de degradación
// que el resto del caché del proyecto).
export async function checkRateLimit(
  prefix: string,
  identifier: string,
  requests: number,
  windowSeconds: number
): Promise<{ success: boolean }> {
  const limiter = getLimiter(prefix, requests, windowSeconds);
  if (!limiter) return { success: true };
  const { success } = await limiter.limit(identifier);
  return { success };
}

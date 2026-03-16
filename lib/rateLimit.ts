import { resetMemoryRuntimeStateForTests } from "@/lib/runtime-state/memory";
import { getRuntimeStateAdapter } from "@/lib/runtime-state";
import type { RateLimitResult } from "@/lib/runtime-state/types";

/**
 * Extract the client IP from reverse-proxy headers.
 *
 * Trust model: this function is only safe when the application sits behind a
 * trusted reverse proxy (e.g. Cloud Run / Google Cloud Load Balancer, Cloud
 * Ingress) that OVERWRITES these headers with the real client IP before
 * forwarding the request. If the application is exposed directly to the
 * internet an attacker can spoof x-forwarded-for to bypass rate limiting.
 * Do NOT use this in deployments without a trusted, header-stripping proxy.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // Take the leftmost (original client) IP from the comma-separated list.
    return forwarded.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

export async function checkRateLimit(
  clientKey: string,
  maxRequestsPerMinute: number,
  burstRequestsPer10s = 6,
): Promise<RateLimitResult> {
  return getRuntimeStateAdapter().checkRateLimit(
    clientKey,
    maxRequestsPerMinute,
    burstRequestsPer10s,
  );
}

export function resetRateLimiterForTests() {
  resetMemoryRuntimeStateForTests();
}

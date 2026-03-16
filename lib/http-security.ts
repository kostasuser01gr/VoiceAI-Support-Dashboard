import { getAppConfig } from "@/lib/config";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isMutatingMethod(method: string) {
  return MUTATING_METHODS.has(method.toUpperCase());
}

function parseAllowedOrigins() {
  const configured = process.env.CSRF_ALLOWED_ORIGINS;
  if (!configured?.trim()) {
    return new Set<string>();
  }

  return new Set(
    configured
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

export function isSameOriginRequest(params: {
  originHeader: string | null;
  hostHeader: string | null;
  forwardedHostHeader: string | null;
  forwardedProtoHeader: string | null;
}) {
  const originHeader = params.originHeader;
  if (!originHeader) {
    return true;
  }

  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    return false;
  }

  const host = params.forwardedHostHeader ?? params.hostHeader;
  if (!host) {
    return false;
  }

  const forwardedProto = params.forwardedProtoHeader;
  const protocol = forwardedProto ? `${forwardedProto}:` : origin.protocol;
  const expectedOrigin = `${protocol}//${host}`;
  if (origin.origin === expectedOrigin) {
    return true;
  }

  const appConfig = getAppConfig();
  if (appConfig.appBaseUrl) {
    try {
      if (origin.origin === new URL(appConfig.appBaseUrl).origin) {
        return true;
      }
    } catch {
      // Ignore malformed APP_BASE_URL and fall through to explicit allowlist.
    }
  }

  const allowedOrigins = parseAllowedOrigins();
  return allowedOrigins.has(origin.origin);
}

export function applySecurityHeaders(headers: Headers) {
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "same-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set("x-dns-prefetch-control", "off");

  if (!headers.has("content-security-policy")) {
    headers.set(
      "content-security-policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' https:",
        "frame-ancestors 'none'",
      ].join("; "),
    );
  }

  if (process.env.NODE_ENV === "production") {
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
}

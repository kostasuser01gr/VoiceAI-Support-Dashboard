import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type ValidationResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

function parseAllowlistHosts() {
  const configured = process.env.WEBHOOK_ALLOWLIST_HOSTS;
  if (!configured?.trim()) {
    return new Set<string>();
  }

  return new Set(
    configured
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isAllowlistedHost(hostname: string, allowlistHosts: Set<string>) {
  if (allowlistHosts.size === 0) {
    return true;
  }

  if (allowlistHosts.has(hostname)) {
    return true;
  }

  return [...allowlistHosts].some((allowed) => hostname.endsWith(`.${allowed}`));
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }

  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 192 && b === 0) {
    return true;
  }
  if (a === 198 && (b === 18 || b === 19)) {
    return true;
  }
  if (a >= 224) {
    return true;
  }
  return false;
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::") {
    return true;
  }

  if (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  if (normalized.startsWith("::ffff:")) {
    const embedded = normalized.slice("::ffff:".length);
    if (embedded && isIP(embedded) === 4) {
      return isPrivateIpv4(embedded);
    }
  }

  return false;
}

function isPrivateIp(address: string) {
  const family = isIP(address);
  if (family === 4) {
    return isPrivateIpv4(address);
  }
  if (family === 6) {
    return isPrivateIpv6(address);
  }
  return true;
}

function hasUnsafeHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".localdomain") ||
    hostname === "metadata.google.internal"
  );
}

export async function validateOutboundUrl(urlRaw: string): Promise<ValidationResult> {
  let url: URL;
  try {
    url = new URL(urlRaw);
  } catch {
    return { ok: false, reason: "Invalid URL." };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "Only HTTPS endpoints are allowed." };
  }

  if (url.username || url.password) {
    return { ok: false, reason: "Credentials in URL are not allowed." };
  }

  const hostname = url.hostname.trim().toLowerCase();
  if (!hostname) {
    return { ok: false, reason: "Hostname is required." };
  }

  if (hasUnsafeHostname(hostname)) {
    return { ok: false, reason: "Private hostnames are not allowed." };
  }

  const allowlistHosts = parseAllowlistHosts();
  if (!isAllowlistedHost(hostname, allowlistHosts)) {
    return { ok: false, reason: "Host is not in webhook allowlist." };
  }

  if (isIP(hostname) !== 0 && isPrivateIp(hostname)) {
    return { ok: false, reason: "Private or reserved IP addresses are blocked." };
  }

  try {
    const resolved = await lookup(hostname, { all: true, verbatim: true });
    if (!resolved.length) {
      return { ok: false, reason: "Hostname resolution failed." };
    }

    for (const entry of resolved) {
      if (isPrivateIp(entry.address)) {
        return { ok: false, reason: "Resolved to private or reserved IP." };
      }
    }
  } catch {
    return { ok: false, reason: "Hostname resolution failed." };
  }

  return {
    ok: true,
    url,
  };
}

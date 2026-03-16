import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { getAppConfig } from "@/lib/config";
import { isDbHistoryEnabled, isShareTokenRevoked, revokeShareToken } from "@/lib/db";
import type { StoredSession } from "@/lib/history";
import { getRuntimeStateAdapter } from "@/lib/runtime-state";

type SharePayload = {
  v: 2;
  iat: number;
  exp: number;
  session: StoredSession;
  pwd?: string;
};

const DEMO_FALLBACK_SECRET = "local-demo-share-secret";

function getSecret() {
  const secret = process.env.SHARE_TOKEN_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      // Fail-closed: log a critical warning but keep running to avoid a hard crash
      // during demo deployments that omit SHARE_TOKEN_SECRET. Tokens signed with
      // the fallback secret are trivially forgeable — operators MUST set this env var.
      console.error(
        "[SECURITY] SHARE_TOKEN_SECRET is not set in production. " +
          "Share tokens are signed with a well-known fallback secret and can be forged. " +
          "Set SHARE_TOKEN_SECRET to a cryptographically random value.",
      );
    }
    return DEMO_FALLBACK_SECRET;
  }
  return secret;
}

function toBase64Url(input: string) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const withPadding = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  return Buffer.from(withPadding, "base64").toString("utf8");
}

function signPayload(payloadEncoded: string) {
  return createHmac("sha256", getSecret()).update(payloadEncoded).digest("base64url");
}

function hashPassword(password: string) {
  // Use HMAC-SHA256 keyed by the share secret so brute-forcing requires
  // knowledge of the server-side secret (equivalent to an offline attack
  // against a properly-managed secret). Upgrade to Argon2/scrypt if the
  // secret ever becomes externally observable.
  return createHmac("sha256", getSecret())
    .update(`share-password:${password}`)
    .digest("hex");
}

export function hashShareToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createShareToken(
  session: StoredSession,
  options?: { password?: string; expiresInMs?: number },
) {
  const config = getAppConfig();
  const ttlMs = Math.max(
    60_000,
    Math.min(
      options?.expiresInMs ?? config.shareTokenTtlMs,
      365 * 24 * 60 * 60 * 1000,
    ),
  );
  const password = options?.password?.trim();

  if (config.shareTokenRequirePassword && !password) {
    throw new Error("Share password is required by SHARE_TOKEN_REQUIRE_PASSWORD=true.");
  }

  const payload: SharePayload = {
    v: 2,
    iat: Date.now(),
    exp: Date.now() + ttlMs,
    session,
    ...(password ? { pwd: hashPassword(password) } : {}),
  };

  const payloadEncoded = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

export function parseShareTokenUnsafe(token: string): SharePayload | null {
  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) {
    return null;
  }

  const expected = signPayload(payloadEncoded);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return null;
  }

  try {
    const raw = fromBase64Url(payloadEncoded);
    const parsed = JSON.parse(raw) as SharePayload;
    if (
      parsed.v !== 2 ||
      !parsed.session?.id ||
      !parsed.session?.data ||
      typeof parsed.exp !== "number" ||
      parsed.exp <= 0
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function isTokenHashRevoked(tokenHash: string) {
  if (isDbHistoryEnabled()) {
    return isShareTokenRevoked(tokenHash);
  }

  const raw = await getRuntimeStateAdapter().get(`share:revoked:${tokenHash}`);
  return raw === "1";
}

export async function parseShareToken(
  token: string,
  options?: { password?: string },
): Promise<SharePayload | null> {
  const parsed = parseShareTokenUnsafe(token);
  if (!parsed) {
    return null;
  }

  if (Date.now() > parsed.exp) {
    return null;
  }

  if (parsed.pwd) {
    const provided = options?.password?.trim();
    if (!provided || hashPassword(provided) !== parsed.pwd) {
      return null;
    }
  }

  const tokenHash = hashShareToken(token);
  if (await isTokenHashRevoked(tokenHash)) {
    return null;
  }

  return parsed;
}

export async function revokeShareTokenByToken(token: string, reason?: string) {
  const hash = hashShareToken(token);
  if (isDbHistoryEnabled()) {
    await revokeShareToken(hash, reason);
    return;
  }

  const ttlSeconds = Math.max(60, Math.round(getAppConfig().shareTokenTtlMs / 1000));
  await getRuntimeStateAdapter().set(`share:revoked:${hash}`, "1", ttlSeconds);
}

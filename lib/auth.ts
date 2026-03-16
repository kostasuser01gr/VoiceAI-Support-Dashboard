import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

export type SessionRole = "owner" | "admin" | "agent" | "viewer";

export type SessionData = {
  userId: string;
  name: string;
  email: string;
  workspaceId: string;
  role: SessionRole;
};

const SESSION_COOKIE = "vaa_demo_session";

export const DEFAULT_SESSION: SessionData = {
  userId: "demo-user",
  name: "Demo User",
  email: "demo@voice-action.local",
  workspaceId: "default-workspace",
  role: "owner",
};

type ParsedSessionCookie = {
  session: SessionData;
  signed: boolean;
};

const SESSION_SIGNATURE_PREFIX = "v1";

function normalizeSession(raw: Partial<SessionData>): SessionData | null {
  const parsedRole: SessionRole | null =
    raw.role === "owner" || raw.role === "admin" || raw.role === "agent" || raw.role === "viewer"
      ? raw.role
      : null;
  if (!raw.userId || !raw.workspaceId || !parsedRole) {
    return null;
  }

  return {
    ...DEFAULT_SESSION,
    ...raw,
    role: parsedRole,
  };
}

function getSessionSigningSecret() {
  return process.env.SESSION_SIGNING_SECRET?.trim() || null;
}

function requireSignedSessionInProd() {
  const raw = process.env.REQUIRE_SIGNED_SESSION_IN_PROD?.trim().toLowerCase();
  if (!raw) {
    return true;
  }
  return ["1", "true", "yes", "on"].includes(raw);
}

function signPayload(payloadBase64Url: string, secret: string) {
  const hmac = createHmac("sha256", secret);
  hmac.update(`${SESSION_SIGNATURE_PREFIX}.${payloadBase64Url}`);
  return hmac.digest("base64url");
}

function verifySignature(payloadBase64Url: string, signatureBase64Url: string, secret: string) {
  const expected = signPayload(payloadBase64Url, secret);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(signatureBase64Url, "utf8");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function decodeSession(raw: string): ParsedSessionCookie | null {
  try {
    const secret = getSessionSigningSecret();
    const requireSigned = process.env.NODE_ENV === "production" && requireSignedSessionInProd();
    if (requireSigned && !secret) {
      return null;
    }
    const [payloadBase64Url, signatureBase64Url, ...rest] = raw.split(".");
    if (!payloadBase64Url || rest.length > 0) {
      return null;
    }

    const signed = Boolean(signatureBase64Url);
    if (requireSigned && !signed) {
      return null;
    }
    if (secret) {
      if (!signed || !signatureBase64Url) {
        return null;
      }
      if (!verifySignature(payloadBase64Url, signatureBase64Url, secret)) {
        return null;
      }
    }

    const parsed = JSON.parse(Buffer.from(payloadBase64Url, "base64url").toString("utf8")) as Partial<SessionData>;
    const session = normalizeSession(parsed);
    if (!session) {
      return null;
    }

    return {
      session,
      signed,
    };
  } catch {
    return null;
  }
}

function encodeSession(session: SessionData) {
  const payloadBase64Url = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const secret = getSessionSigningSecret();
  const requireSigned = process.env.NODE_ENV === "production" && requireSignedSessionInProd();
  if (requireSigned && !secret) {
    throw new Error(
      "SESSION_SIGNING_SECRET is required when REQUIRE_SIGNED_SESSION_IN_PROD=true.",
    );
  }
  if (!secret) {
    return payloadBase64Url;
  }

  const signatureBase64Url = signPayload(payloadBase64Url, secret);
  return `${payloadBase64Url}.${signatureBase64Url}`;
}

export function parseSessionCookieValue(raw?: string | null) {
  if (!raw) {
    return null;
  }

  return decodeSession(raw);
}

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

export async function getServerSession() {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE)?.value;
  if (!value) {
    return DEFAULT_SESSION;
  }

  return decodeSession(value)?.session ?? DEFAULT_SESSION;
}

export async function setServerSession(session: Partial<SessionData>) {
  const cookieStore = await cookies();
  const merged: SessionData = {
    ...DEFAULT_SESSION,
    ...session,
  };

  cookieStore.set({
    name: SESSION_COOKIE,
    value: encodeSession(merged),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });

  return merged;
}

export async function clearServerSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) {
    return "hidden";
  }

  if (local.length <= 2) {
    return `${local[0] ?? "*"}*@${domain}`;
  }

  return `${local.slice(0, 2)}***@${domain}`;
}

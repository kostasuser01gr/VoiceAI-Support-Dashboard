import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { applySecurityHeaders, isMutatingMethod, isSameOriginRequest } from "@/lib/http-security";

type SessionRole = "owner" | "admin" | "agent" | "viewer";

type SessionData = {
  userId: string;
  name: string;
  email: string;
  workspaceId: string;
  role: SessionRole;
};

const SESSION_COOKIE = "vaa_demo_session";
const DEFAULT_SESSION: SessionData = {
  userId: "demo-user",
  name: "Demo User",
  email: "demo@voice-action.local",
  workspaceId: "default-workspace",
  role: "owner",
};

function safeDecode(raw?: string) {
  if (!raw) {
    return null;
  }

  try {
    const json = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed = JSON.parse(json) as SessionData;
    if (!parsed.userId || !parsed.workspaceId || !parsed.role) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function safeEncode(session: SessionData) {
  const base64 = btoa(JSON.stringify(session));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/api/") && isMutatingMethod(request.method)) {
    const csrfAllowed = isSameOriginRequest({
      originHeader: request.headers.get("origin"),
      hostHeader: request.headers.get("host"),
      forwardedHostHeader: request.headers.get("x-forwarded-host"),
      forwardedProtoHeader: request.headers.get("x-forwarded-proto"),
    });

    if (!csrfAllowed) {
      const blocked = NextResponse.json(
        {
          error: {
            code: "CSRF_BLOCKED",
            detailsCode: "ORIGIN_MISMATCH",
            message: "Mutating API request blocked by CSRF policy.",
            requestId: crypto.randomUUID(),
          },
        },
        { status: 403 },
      );
      applySecurityHeaders(blocked.headers);
      return blocked;
    }
  }

  const existing = request.cookies.get(SESSION_COOKIE)?.value;
  const session = safeDecode(existing) ?? DEFAULT_SESSION;

  const headers = new Headers(request.headers);
  headers.set("x-session-user-id", session.userId);
  headers.set("x-session-workspace-id", session.workspaceId);
  headers.set("x-session-role", session.role);

  const requestedWorkspace = headers.get("x-workspace-id");
  if (requestedWorkspace && requestedWorkspace !== session.workspaceId) {
    headers.set("x-workspace-id", session.workspaceId);
  }

  const response = NextResponse.next({
    request: {
      headers,
    },
  });

  if (!existing) {
    response.cookies.set({
      name: SESSION_COOKIE,
      value: safeEncode(session),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
  }

  applySecurityHeaders(response.headers);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

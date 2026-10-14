import { NextResponse } from "next/server";

import type { SessionData, SessionRole } from "@/lib/auth";

const ROLE_RANK: Record<SessionRole, number> = {
  viewer: 0,
  agent: 1,
  admin: 2,
  owner: 3,
};

export function hasRole(
  currentRole: SessionRole | undefined | null,
  requiredRoles: SessionRole[],
) {
  if (!currentRole || typeof currentRole !== "string") {
    return false;
  }
  const currentRank = ROLE_RANK[currentRole];
  if (currentRank === undefined) {
    return false;
  }
  return requiredRoles.some((role) => {
    const requiredRank = ROLE_RANK[role];
    return requiredRank !== undefined && currentRank >= requiredRank;
  });
}

export function forbiddenResponse(requestId: string, detailsCode = "RBAC_FORBIDDEN") {
  return NextResponse.json(
    {
      error: {
        code: "FORBIDDEN",
        detailsCode,
        message: "You do not have permission for this action.",
        requestId,
      },
    },
    { status: 403 },
  );
}

export function ensureRole(
  session: SessionData | null | undefined,
  requiredRoles: SessionRole[],
  requestId: string,
  detailsCode?: string,
) {
  if (!session || !hasRole(session.role, requiredRoles)) {
    return forbiddenResponse(requestId, detailsCode);
  }

  return null;
}
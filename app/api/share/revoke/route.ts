import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRoleAndWorkspaceFromRequest } from "@/lib/api-guards";
import {
  JsonBodyParseError,
  JsonBodyTooLargeError,
  readJsonBodyWithLimit,
} from "@/lib/request-body";
import { revokeShareTokenByToken } from "@/lib/share";

export const runtime = "nodejs";

const BodySchema = z
  .object({
    token: z.string().trim().min(20),
    reason: z.string().trim().max(200).optional(),
  })
  .strict();

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("x-correlation-id") ?? requestId;

  const { denied } = await requireRoleAndWorkspaceFromRequest(
    request,
    requestId,
    ["agent"],
    "RBAC_SHARE_REVOKE_DENIED",
  );
  if (denied) {
    denied.headers.set("x-correlation-id", correlationId);
    return denied;
  }

  let raw: unknown;
  try {
    raw = await readJsonBodyWithLimit(request, 8_000);
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          detailsCode:
            error instanceof JsonBodyTooLargeError
              ? "SHARE_REVOKE_PAYLOAD_TOO_LARGE"
              : "SHARE_REVOKE_BAD_JSON",
          message:
            error instanceof JsonBodyTooLargeError
              ? error.message
              : error instanceof JsonBodyParseError
                ? error.message
                : "Invalid revoke payload.",
          requestId,
        },
      },
      {
        status: error instanceof JsonBodyTooLargeError ? 413 : 400,
        headers: { "x-correlation-id": correlationId },
      },
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          detailsCode: "SHARE_REVOKE_PAYLOAD_INVALID",
          message: "Invalid revoke payload.",
          requestId,
        },
      },
      { status: 400, headers: { "x-correlation-id": correlationId } },
    );
  }

  await revokeShareTokenByToken(parsed.data.token, parsed.data.reason);
  return NextResponse.json(
    { ok: true, requestId },
    { headers: { "x-correlation-id": correlationId } },
  );
}

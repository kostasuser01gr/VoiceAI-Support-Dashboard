import { NextResponse } from "next/server";
import { z } from "zod";

import { readJsonBodyWithLimit, JsonBodyParseError, JsonBodyTooLargeError } from "@/lib/request-body";
import { requireRoleFromRequest } from "@/lib/api-guards";
import { ProcessResponseSchema } from "@/lib/schema";
import { validateOutboundUrl } from "@/lib/ssrf";

const BodySchema = z
  .object({
    endpoint: z.string().url(),
    session: ProcessResponseSchema,
  })
  .strict();

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const { denied } = requireRoleFromRequest(
    request,
    requestId,
    ["agent"],
    "RBAC_WEBHOOK_EXPORT_DENIED",
  );
  if (denied) {
    return denied;
  }

  let raw: unknown;
  try {
    raw = await readJsonBodyWithLimit(request, 32_000);
  } catch (error) {
    const detailsCode =
      error instanceof JsonBodyTooLargeError ? "WEBHOOK_PAYLOAD_TOO_LARGE" : "WEBHOOK_BAD_JSON";
    const message =
      error instanceof JsonBodyTooLargeError
        ? error.message
        : error instanceof JsonBodyParseError
          ? error.message
          : "Invalid webhook payload.";
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          detailsCode,
          message,
          requestId,
        },
      },
      { status: error instanceof JsonBodyTooLargeError ? 413 : 400 },
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          detailsCode: "WEBHOOK_PAYLOAD_INVALID",
          message: "Invalid webhook export payload.",
          requestId,
        },
      },
      { status: 400 },
    );
  }

  const endpointValidation = await validateOutboundUrl(parsed.data.endpoint);
  if (!endpointValidation.ok) {
    return NextResponse.json(
      {
        error: {
          code: "UNSAFE_ENDPOINT",
          detailsCode: "WEBHOOK_ENDPOINT_UNSAFE",
          message: endpointValidation.reason,
          requestId,
        },
      },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(endpointValidation.url.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(parsed.data.session),
    });

    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      requestId,
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "WEBHOOK_DELIVERY_FAILED",
          detailsCode: "WEBHOOK_DELIVERY_ERROR",
          message: "Failed to deliver webhook payload.",
          requestId,
        },
      },
      { status: 502 },
    );
  }
}

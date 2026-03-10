import { NextResponse } from "next/server";
import { z } from "zod";

import { clearServerSession, getServerSession, setServerSession } from "@/lib/auth";
import {
  JsonBodyParseError,
  JsonBodyTooLargeError,
  readJsonBodyWithLimit,
} from "@/lib/request-body";

const UpdateSessionSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    email: z.string().trim().email().optional(),
    workspaceId: z.string().trim().min(1).max(80).optional(),
    role: z.enum(["owner", "admin", "agent", "viewer"]).optional(),
  })
  .strict();

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  return NextResponse.json({ session });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await readJsonBodyWithLimit(request, 8_000);
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          message:
            error instanceof JsonBodyTooLargeError
              ? error.message
              : error instanceof JsonBodyParseError
                ? error.message
                : "Invalid session payload.",
        },
      },
      { status: error instanceof JsonBodyTooLargeError ? 413 : 400 },
    );
  }

  const parsed = UpdateSessionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "Invalid session payload.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const session = await setServerSession(parsed.data);
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "SESSION_CONFIG_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Session signing configuration is invalid.",
        },
      },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  await clearServerSession();
  return NextResponse.json({ ok: true });
}

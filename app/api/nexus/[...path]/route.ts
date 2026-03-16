import { NextRequest, NextResponse } from "next/server";

const NEXUS_API =
  process.env.NEXUS_API_URL ??
  "https://black-vault-nexus-live-690989569474.europe-west1.run.app";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const target = `${NEXUS_API}/${path.join("/")}`;
  const res = await fetch(target, {
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const target = `${NEXUS_API}/${path.join("/")}`;
  const body = await request.json();
  const res = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

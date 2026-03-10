import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

import { lookup } from "node:dns/promises";

import { validateOutboundUrl } from "@/lib/ssrf";

const mockedLookup = vi.mocked(lookup);

function lookupResult(address: string) {
  return [{ address, family: 4 }] as unknown as Awaited<ReturnType<typeof lookup>>;
}

describe("ssrf validator", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mockedLookup.mockReset();
  });

  it("blocks non-https URLs", async () => {
    const result = await validateOutboundUrl("http://example.com/webhook");
    expect(result.ok).toBe(false);
  });

  it("blocks localhost and private ranges", async () => {
    expect(await validateOutboundUrl("https://localhost/hook")).toMatchObject({
      ok: false,
    });
    expect(await validateOutboundUrl("https://127.0.0.1/hook")).toMatchObject({
      ok: false,
    });
    expect(await validateOutboundUrl("https://10.0.0.7/hook")).toMatchObject({
      ok: false,
    });
  });

  it("blocks domains resolving to private addresses", async () => {
    mockedLookup.mockResolvedValue(lookupResult("10.0.0.8"));
    const result = await validateOutboundUrl("https://safe.example/webhook");
    expect(result.ok).toBe(false);
  });

  it("allows public domains with public resolution", async () => {
    mockedLookup.mockResolvedValue(lookupResult("93.184.216.34"));
    const result = await validateOutboundUrl("https://example.com/webhook");
    expect(result).toMatchObject({ ok: true });
  });

  it("enforces optional allowlist hosts when configured", async () => {
    vi.stubEnv("WEBHOOK_ALLOWLIST_HOSTS", "trusted.example");
    mockedLookup.mockResolvedValue(lookupResult("93.184.216.34"));

    const blocked = await validateOutboundUrl("https://example.com/webhook");
    expect(blocked.ok).toBe(false);

    const allowed = await validateOutboundUrl("https://trusted.example/webhook");
    expect(allowed.ok).toBe(true);
  });
});

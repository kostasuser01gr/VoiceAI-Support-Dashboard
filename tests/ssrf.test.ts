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

  // parseAllowlistHosts edge cases — kills MethodExpression mutants on lines 10-17
  it("allowlist with spaces and mixed case is normalised", async () => {
    vi.stubEnv("WEBHOOK_ALLOWLIST_HOSTS", " Trusted.EXAMPLE , other.COM ");
    mockedLookup.mockResolvedValue(lookupResult("93.184.216.34"));
    // Should match despite casing
    expect(await validateOutboundUrl("https://trusted.example/hook")).toMatchObject({ ok: true });
    expect(await validateOutboundUrl("https://other.com/hook")).toMatchObject({ ok: true });
    // Not in list
    const blocked = await validateOutboundUrl("https://notlisted.example/hook");
    expect(blocked.ok).toBe(false);
  });

  it("allows subdomain of allowlisted host", async () => {
    vi.stubEnv("WEBHOOK_ALLOWLIST_HOSTS", "trusted.example");
    mockedLookup.mockResolvedValue(lookupResult("93.184.216.34"));
    const result = await validateOutboundUrl("https://sub.trusted.example/hook");
    expect(result.ok).toBe(true);
  });

  it("blocks URLs with credentials in them", async () => {
    const result = await validateOutboundUrl("https://user:pass@example.com/hook");
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toMatch(/credentials/i);
  });

  it("blocks invalid / unparseable URL string", async () => {
    const result = await validateOutboundUrl("not a url");
    expect(result.ok).toBe(false);
  });

  it("blocks metadata.google.internal", async () => {
    const result = await validateOutboundUrl("https://metadata.google.internal/computeMetadata/v1/");
    expect(result.ok).toBe(false);
  });

  it("blocks *.local hostnames", async () => {
    const result = await validateOutboundUrl("https://server.local/hook");
    expect(result.ok).toBe(false);
  });

  it("blocks *.internal hostnames", async () => {
    const result = await validateOutboundUrl("https://api.internal/hook");
    expect(result.ok).toBe(false);
  });

  // Boundary-value tests: lookup is mocked with a PUBLIC IP so that if a mutation
  // removes the private-range check, the URL resolves successfully → ok:true,
  // killing the ConditionalExpression mutant that would otherwise also return ok:false
  // via DNS failure (too-weak assertion).
  it("blocks 172.16-31.x.x private range — boundary values", async () => {
    mockedLookup.mockResolvedValue(lookupResult("93.184.216.34"));
    expect(await validateOutboundUrl("https://172.16.0.1/hook")).toMatchObject({ ok: false });
    expect(await validateOutboundUrl("https://172.31.0.1/hook")).toMatchObject({ ok: false });
  });

  it("blocks 172.15.x.x — just below private range (public boundary)", async () => {
    mockedLookup.mockResolvedValue(lookupResult("172.15.0.1"));
    const result = await validateOutboundUrl("https://172.15.0.1/hook");
    expect(result).toMatchObject({ ok: true });
  });

  it("blocks 172.32.x.x — just above private range (public boundary)", async () => {
    mockedLookup.mockResolvedValue(lookupResult("172.32.0.1"));
    const result = await validateOutboundUrl("https://172.32.0.1/hook");
    expect(result).toMatchObject({ ok: true });
  });

  it("blocks 192.168.x.x private range", async () => {
    mockedLookup.mockResolvedValue(lookupResult("93.184.216.34"));
    expect(await validateOutboundUrl("https://192.168.1.1/hook")).toMatchObject({ ok: false });
  });

  it("blocks 169.254.x.x link-local — boundary", async () => {
    mockedLookup.mockResolvedValue(lookupResult("93.184.216.34"));
    expect(await validateOutboundUrl("https://169.254.0.1/hook")).toMatchObject({ ok: false });
    expect(await validateOutboundUrl("https://169.254.169.254/hook")).toMatchObject({ ok: false });
  });

  it("blocks 100.64.x.x — lower CGNAT boundary", async () => {
    mockedLookup.mockResolvedValue(lookupResult("93.184.216.34"));
    expect(await validateOutboundUrl("https://100.64.0.1/hook")).toMatchObject({ ok: false });
  });

  it("blocks 100.127.x.x — upper CGNAT boundary", async () => {
    mockedLookup.mockResolvedValue(lookupResult("93.184.216.34"));
    expect(await validateOutboundUrl("https://100.127.0.1/hook")).toMatchObject({ ok: false });
  });

  it("allows 100.63.x.x — just below CGNAT range (public boundary)", async () => {
    mockedLookup.mockResolvedValue(lookupResult("100.63.0.1"));
    const result = await validateOutboundUrl("https://100.63.0.1/hook");
    expect(result).toMatchObject({ ok: true });
  });

  it("allows 100.128.x.x — just above CGNAT range (public boundary)", async () => {
    mockedLookup.mockResolvedValue(lookupResult("100.128.0.1"));
    const result = await validateOutboundUrl("https://100.128.0.1/hook");
    expect(result).toMatchObject({ ok: true });
  });

  it("blocks multicast 224.0.0.1 — lower boundary", async () => {
    mockedLookup.mockResolvedValue(lookupResult("93.184.216.34"));
    expect(await validateOutboundUrl("https://224.0.0.1/hook")).toMatchObject({ ok: false });
    expect(await validateOutboundUrl("https://255.255.255.255/hook")).toMatchObject({ ok: false });
  });

  it("allows 223.x.x.x — just below multicast (public boundary)", async () => {
    mockedLookup.mockResolvedValue(lookupResult("223.0.0.1"));
    const result = await validateOutboundUrl("https://223.0.0.1/hook");
    expect(result).toMatchObject({ ok: true });
  });

  it("blocks 0.0.0.0 — zero address", async () => {
    mockedLookup.mockResolvedValue(lookupResult("93.184.216.34"));
    expect(await validateOutboundUrl("https://0.0.0.0/hook")).toMatchObject({ ok: false });
  });

  it("blocks 10.x.x.x — class A private", async () => {
    mockedLookup.mockResolvedValue(lookupResult("93.184.216.34"));
    expect(await validateOutboundUrl("https://10.0.0.1/hook")).toMatchObject({ ok: false });
  });

  it("blocks 127.x.x.x — loopback", async () => {
    mockedLookup.mockResolvedValue(lookupResult("93.184.216.34"));
    expect(await validateOutboundUrl("https://127.0.0.1/hook")).toMatchObject({ ok: false });
    expect(await validateOutboundUrl("https://127.255.255.255/hook")).toMatchObject({ ok: false });
  });

  it("allows 11.x.x.x — just above class A private (public)", async () => {
    mockedLookup.mockResolvedValue(lookupResult("11.0.0.1"));
    const result = await validateOutboundUrl("https://11.0.0.1/hook");
    expect(result).toMatchObject({ ok: true });
  });

  it("blocks 198.18.x.x and 198.19.x.x — benchmark range", async () => {
    mockedLookup.mockResolvedValue(lookupResult("93.184.216.34"));
    expect(await validateOutboundUrl("https://198.18.0.1/hook")).toMatchObject({ ok: false });
    expect(await validateOutboundUrl("https://198.19.0.1/hook")).toMatchObject({ ok: false });
  });

  it("allows 198.17.x.x — just below benchmark range (public)", async () => {
    mockedLookup.mockResolvedValue(lookupResult("198.17.0.1"));
    const result = await validateOutboundUrl("https://198.17.0.1/hook");
    expect(result).toMatchObject({ ok: true });
  });

  it("allows 198.20.x.x — just above benchmark range (public)", async () => {
    mockedLookup.mockResolvedValue(lookupResult("198.20.0.1"));
    const result = await validateOutboundUrl("https://198.20.0.1/hook");
    expect(result).toMatchObject({ ok: true });
  });

  it("blocks IPv6 loopback ::1", async () => {
    expect(await validateOutboundUrl("https://[::1]/hook")).toMatchObject({ ok: false });
  });

  // IPv6 addresses: url.hostname returns "[fc00::1]" WITH brackets, so isIP()=0,
  // skipping direct-IP check. Private IPv6 ranges are blocked via DNS lookup failure
  // (lookup("[fc00::1]") errors → caught → ok:false). No lookup mock needed here.
  it("blocks IPv6 private fc::/7 range", async () => {
    expect(await validateOutboundUrl("https://[fc00::1]/hook")).toMatchObject({ ok: false });
    expect(await validateOutboundUrl("https://[fd12:3456::1]/hook")).toMatchObject({ ok: false });
  });

  it("blocks IPv6 link-local fe80::/10 — fe80, fe9, fea, feb prefixes", async () => {
    expect(await validateOutboundUrl("https://[fe80::1]/hook")).toMatchObject({ ok: false });
    expect(await validateOutboundUrl("https://[fe90::1]/hook")).toMatchObject({ ok: false });
    expect(await validateOutboundUrl("https://[fea0::1]/hook")).toMatchObject({ ok: false });
    expect(await validateOutboundUrl("https://[feb0::1]/hook")).toMatchObject({ ok: false });
  });

  it("blocks ::ffff:<private-ipv4> mapped addresses", async () => {
    expect(await validateOutboundUrl("https://[::ffff:10.0.0.1]/hook")).toMatchObject({ ok: false });
    expect(await validateOutboundUrl("https://[::ffff:192.168.1.1]/hook")).toMatchObject({ ok: false });
  });

  it("returns error when DNS lookup returns empty list", async () => {
    mockedLookup.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof lookup>>);
    const result = await validateOutboundUrl("https://nodns.example/hook");
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toMatch(/resolution failed/i);
  });

  it("returns error when DNS lookup throws", async () => {
    mockedLookup.mockRejectedValue(new Error("ENOTFOUND"));
    const result = await validateOutboundUrl("https://nodns.example/hook");
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toMatch(/resolution failed/i);
  });
});

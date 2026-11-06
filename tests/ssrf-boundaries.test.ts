import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

import { lookup } from 'node:dns/promises';

import { validateOutboundUrl } from '@/lib/ssrf';

const mockedLookup = vi.mocked(lookup);

type Resolved = Awaited<ReturnType<typeof lookup>>;

function resolves(...addresses: string[]) {
  return addresses.map((address) => ({
    address,
    family: address.includes(':') ? 6 : 4,
  })) as unknown as Resolved;
}

describe('ssrf validator boundaries', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mockedLookup.mockReset();
  });

  it('reports a specific reason for non-https URLs', async () => {
    const result = await validateOutboundUrl('http://example.com/hook');
    expect(result).toMatchObject({ ok: false });
    expect((result as { reason: string }).reason).toMatch(/https/i);
  });

  it('blocks password-only credentials', async () => {
    const result = await validateOutboundUrl('https://:secret@example.com/hook');
    expect(result).toMatchObject({ ok: false });
    expect((result as { reason: string }).reason).toMatch(/credentials/i);
  });

  it('blocks .localdomain hostnames', async () => {
    mockedLookup.mockResolvedValue(resolves('93.184.216.34'));
    expect(await validateOutboundUrl('https://box.localdomain/hook')).toMatchObject({ ok: false });
  });

  it('blocks 192.0.x.x and allows 192.1.x.x', async () => {
    mockedLookup.mockResolvedValue(resolves('93.184.216.34'));
    expect(await validateOutboundUrl('https://192.0.2.1/hook')).toMatchObject({ ok: false });
    mockedLookup.mockResolvedValue(resolves('192.1.0.1'));
    expect(await validateOutboundUrl('https://192.1.0.1/hook')).toMatchObject({ ok: true });
  });

  it('allows 192.167.x.x and 192.169.x.x around the 192.168 private range', async () => {
    mockedLookup.mockResolvedValue(resolves('192.167.1.1'));
    expect(await validateOutboundUrl('https://192.167.1.1/hook')).toMatchObject({ ok: true });
    mockedLookup.mockResolvedValue(resolves('192.169.1.1'));
    expect(await validateOutboundUrl('https://192.169.1.1/hook')).toMatchObject({ ok: true });
  });

  it('allows addresses just outside the 169.254 link-local range', async () => {
    mockedLookup.mockResolvedValue(resolves('169.253.0.1'));
    expect(await validateOutboundUrl('https://169.253.0.1/hook')).toMatchObject({ ok: true });
    mockedLookup.mockResolvedValue(resolves('169.255.0.1'));
    expect(await validateOutboundUrl('https://169.255.0.1/hook')).toMatchObject({ ok: true });
  });

  it('blocks a host when any resolved address is private', async () => {
    mockedLookup.mockResolvedValue(resolves('93.184.216.34', '10.1.2.3'));
    const result = await validateOutboundUrl('https://mixed.example/hook');
    expect(result).toMatchObject({ ok: false });
    expect((result as { reason: string }).reason).toMatch(/private/i);
  });

  it('blocks private IPv6 addresses returned by DNS', async () => {
    for (const address of ['::1', '::', 'fd00::1', 'fc00::1', 'fe80::1', 'fe90::1', 'fea0::1', 'feb0::1']) {
      mockedLookup.mockResolvedValue(resolves(address));
      expect(await validateOutboundUrl('https://v6.example/hook')).toMatchObject({ ok: false });
    }
  });

  it('handles IPv4-mapped IPv6 addresses returned by DNS', async () => {
    mockedLookup.mockResolvedValue(resolves('::ffff:10.0.0.1'));
    expect(await validateOutboundUrl('https://mapped.example/hook')).toMatchObject({ ok: false });
    mockedLookup.mockResolvedValue(resolves('::ffff:8.8.8.8'));
    expect(await validateOutboundUrl('https://mapped.example/hook')).toMatchObject({ ok: true });
  });

  it('allows public IPv6 addresses returned by DNS', async () => {
    mockedLookup.mockResolvedValue(resolves('2001:4860:4860::8888'));
    expect(await validateOutboundUrl('https://v6.example/hook')).toMatchObject({ ok: true });
  });

  it('does not treat a lookalike host as a subdomain of an allowlisted host', async () => {
    vi.stubEnv('WEBHOOK_ALLOWLIST_HOSTS', 'trusted.example');
    mockedLookup.mockResolvedValue(resolves('93.184.216.34'));
    const result = await validateOutboundUrl('https://nottrusted.example/hook');
    expect(result).toMatchObject({ ok: false });
    expect((result as { reason: string }).reason).toMatch(/allowlist/i);
  });

  it('ignores empty allowlist entries', async () => {
    vi.stubEnv('WEBHOOK_ALLOWLIST_HOSTS', ' , trusted.example , ');
    mockedLookup.mockResolvedValue(resolves('93.184.216.34'));
    expect(await validateOutboundUrl('https://trusted.example/hook')).toMatchObject({ ok: true });
    expect(await validateOutboundUrl('https://other.example/hook')).toMatchObject({ ok: false });
  });

  it('treats a blank allowlist as unset', async () => {
    vi.stubEnv('WEBHOOK_ALLOWLIST_HOSTS', '   ');
    mockedLookup.mockResolvedValue(resolves('93.184.216.34'));
    expect(await validateOutboundUrl('https://anything.example/hook')).toMatchObject({ ok: true });
  });

  it('returns the parsed URL on success', async () => {
    mockedLookup.mockResolvedValue(resolves('93.184.216.34'));
    const result = await validateOutboundUrl('https://example.com/hook?x=1');
    expect(result.ok).toBe(true);
    expect((result as { url: URL }).url.href).toBe('https://example.com/hook?x=1');
  });
});

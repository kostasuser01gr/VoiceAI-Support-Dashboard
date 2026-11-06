import { describe, expect, it } from 'vitest';

import type { SessionData, SessionRole } from '@/lib/auth';
import { ensureRole, forbiddenResponse, hasRole } from '@/lib/rbac';

function sessionWith(role: SessionRole): SessionData {
  return {
    userId: 'u1',
    name: 'Test',
    email: 't@example.com',
    workspaceId: 'ws1',
    role,
  };
}

describe('hasRole', () => {
  it('allows equal and higher ranks', () => {
    expect(hasRole('agent', ['agent'])).toBe(true);
    expect(hasRole('admin', ['agent'])).toBe(true);
    expect(hasRole('owner', ['agent'])).toBe(true);
    expect(hasRole('owner', ['owner'])).toBe(true);
    expect(hasRole('viewer', ['viewer'])).toBe(true);
  });

  it('denies lower ranks', () => {
    expect(hasRole('viewer', ['agent'])).toBe(false);
    expect(hasRole('agent', ['admin'])).toBe(false);
    expect(hasRole('admin', ['owner'])).toBe(false);
  });

  it('passes when any required role is satisfied', () => {
    expect(hasRole('agent', ['owner', 'agent'])).toBe(true);
    expect(hasRole('viewer', ['owner', 'admin'])).toBe(false);
  });

  it('denies when no roles are required', () => {
    expect(hasRole('owner', [])).toBe(false);
  });

  it('treats an unknown role as the lowest rank', () => {
    const unknown = 'ghost' as unknown as SessionRole;
    expect(hasRole(unknown, ['viewer'])).toBe(true);
    expect(hasRole(unknown, ['agent'])).toBe(false);
  });
});

describe('forbiddenResponse', () => {
  it('returns a 403 with the default details code', async () => {
    const res = forbiddenResponse('req-1');
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({
      error: {
        code: 'FORBIDDEN',
        detailsCode: 'RBAC_FORBIDDEN',
        message: 'You do not have permission for this action.',
        requestId: 'req-1',
      },
    });
  });

  it('uses a custom details code', async () => {
    const res = forbiddenResponse('req-2', 'CUSTOM_CODE');
    const body = await res.json();
    expect(body.error.detailsCode).toBe('CUSTOM_CODE');
    expect(body.error.requestId).toBe('req-2');
  });
});

describe('ensureRole', () => {
  it('returns null when the session role is sufficient', () => {
    expect(ensureRole(sessionWith('admin'), ['agent'], 'req-3')).toBeNull();
  });

  it('returns a 403 response when the session role is insufficient', async () => {
    const res = ensureRole(sessionWith('viewer'), ['admin'], 'req-4', 'ADMIN_ONLY');
    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
    const body = await res?.json();
    expect(body.error.detailsCode).toBe('ADMIN_ONLY');
    expect(body.error.requestId).toBe('req-4');
  });

  it('falls back to the default details code', async () => {
    const res = ensureRole(sessionWith('viewer'), ['owner'], 'req-5');
    const body = await res?.json();
    expect(body.error.detailsCode).toBe('RBAC_FORBIDDEN');
  });
});

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { requireAdmin, requireAuth } from '../src/lib/api-guard';
import { signAuthToken, AUTH_COOKIE_NAME } from '../src/lib/jwt';

describe('api-guard module', () => {
  it('requireAdmin rejects unauthenticated requests with 401', async () => {
    const req = new NextRequest('https://example.com/api/admin/users');
    const result = await requireAdmin(req);

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(401);
      const json = await result.response.json();
      expect(json.error).toContain('وارد سیستم شوید');
    }
  });

  it('requireAdmin rejects viewer users with 403', async () => {
    const token = await signAuthToken({
      id: 10,
      username: 'viewer_user',
      role: 'viewer',
    });

    const req = new NextRequest('https://example.com/api/admin/users', {
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${token}`,
      },
    });

    const result = await requireAdmin(req);
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(403);
      const json = await result.response.json();
      expect(json.error).toContain('فقط برای مدیران');
    }
  });

  it('requireAdmin allows admin users with authorized: true', async () => {
    const token = await signAuthToken({
      id: 1,
      username: 'admin_user',
      role: 'admin',
    });

    const req = new NextRequest('https://example.com/api/admin/users', {
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${token}`,
      },
    });

    const result = await requireAdmin(req);
    expect(result.authorized).toBe(true);
    if (result.authorized) {
      expect(result.user.id).toBe(1);
      expect(result.user.username).toBe('admin_user');
      expect(result.user.role).toBe('admin');
    }
  });

  it('requireAuth rejects unauthenticated requests with 401', async () => {
    const req = new NextRequest('https://example.com/api/products');
    const result = await requireAuth(req);

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(401);
    }
  });

  it('requireAuth allows both viewer and admin users', async () => {
    const viewerToken = await signAuthToken({
      id: 20,
      username: 'viewer_alice',
      role: 'viewer',
    });

    const reqViewer = new NextRequest('https://example.com/api/products', {
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${viewerToken}`,
      },
    });

    const resultViewer = await requireAuth(reqViewer);
    expect(resultViewer.authorized).toBe(true);
    if (resultViewer.authorized) {
      expect(resultViewer.user.username).toBe('viewer_alice');
    }

    const adminToken = await signAuthToken({
      id: 2,
      username: 'admin_bob',
      role: 'admin',
    });

    const reqAdmin = new NextRequest('https://example.com/api/products', {
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${adminToken}`,
      },
    });

    const resultAdmin = await requireAuth(reqAdmin);
    expect(resultAdmin.authorized).toBe(true);
    if (resultAdmin.authorized) {
      expect(resultAdmin.user.username).toBe('admin_bob');
    }
  });
});

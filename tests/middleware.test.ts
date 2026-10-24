import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../src/middleware';
import { signAuthToken, AUTH_COOKIE_NAME } from '../src/lib/jwt';

describe('Next.js RBAC & Edge Middleware', () => {
  it('allows static assets to pass through without authentication', async () => {
    const staticReq = new NextRequest('https://example.com/_next/static/chunks/main.js');
    const res = await middleware(staticReq);
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    expect(res.status).toBe(200);

    const imgReq = new NextRequest('https://example.com/logo.png');
    const imgRes = await middleware(imgReq);
    expect(imgRes.status).toBe(200);
  });

  it('allows public routes like /login and /api/health without authentication', async () => {
    const loginReq = new NextRequest('https://example.com/login');
    const loginRes = await middleware(loginReq);
    expect(loginRes.status).toBe(200);

    const healthReq = new NextRequest('https://example.com/api/health');
    const healthRes = await middleware(healthReq);
    expect(healthRes.status).toBe(200);

    const apiLoginReq = new NextRequest('https://example.com/api/auth/login');
    const apiLoginRes = await middleware(apiLoginReq);
    expect(apiLoginRes.status).toBe(200);
  });

  it('redirects unauthenticated page requests to /login with redirect parameter', async () => {
    const pageReq = new NextRequest('https://example.com/products');
    const res = await middleware(pageReq);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login?redirect=%2Fproducts');
  });

  it('returns 401 JSON for unauthenticated API requests', async () => {
    const apiReq = new NextRequest('https://example.com/api/products');
    const res = await middleware(apiReq);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('وارد شوید');
  });

  it('redirects already logged-in users visiting /login to appropriate page', async () => {
    const adminToken = await signAuthToken({ id: 1, username: 'admin', role: 'admin' });
    const req = new NextRequest('https://example.com/login', {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${adminToken}` },
    });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/admin');

    // With redirect param
    const reqWithRedirect = new NextRequest('https://example.com/login?redirect=/history', {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${adminToken}` },
    });
    const resRedirect = await middleware(reqWithRedirect);
    expect(resRedirect.headers.get('location')).toContain('/history');
  });

  it('enforces must_change_password and restricts access', async () => {
    const mustChangeToken = await signAuthToken({
      id: 5,
      username: 'temp_user',
      role: 'viewer',
      must_change_password: true,
    });

    // Allowed endpoints
    const allowedPageReq = new NextRequest('https://example.com/change-password', {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${mustChangeToken}` },
    });
    expect((await middleware(allowedPageReq)).status).toBe(200);

    const allowedApiReq = new NextRequest('https://example.com/api/auth/change-password', {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${mustChangeToken}` },
    });
    expect((await middleware(allowedApiReq)).status).toBe(200);

    // Disallowed page redirects to /change-password
    const forbiddenPageReq = new NextRequest('https://example.com/products', {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${mustChangeToken}` },
    });
    const pageRes = await middleware(forbiddenPageReq);
    expect(pageRes.status).toBe(307);
    expect(pageRes.headers.get('location')).toContain('/change-password');

    // Disallowed API returns 403 JSON
    const forbiddenApiReq = new NextRequest('https://example.com/api/products', {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${mustChangeToken}` },
    });
    const apiRes = await middleware(forbiddenApiReq);
    expect(apiRes.status).toBe(403);
    const json = await apiRes.json();
    expect(json.error).toContain('الزام تغییر کلمه عبور');
  });

  it('allows authenticated users without must_change_password to access /change-password', async () => {
    const normalUserToken = await signAuthToken({
      id: 2,
      username: 'normal_user',
      role: 'viewer',
      must_change_password: false,
    });

    const req = new NextRequest('https://example.com/change-password', {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${normalUserToken}` },
    });
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  it('prevents viewer users from accessing admin routes', async () => {
    const viewerToken = await signAuthToken({ id: 10, username: 'viewer_bob', role: 'viewer' });

    // Admin UI page redirects viewer to '/'
    const adminPageReq = new NextRequest('https://example.com/admin/sources', {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${viewerToken}` },
    });
    const pageRes = await middleware(adminPageReq);
    expect(pageRes.status).toBe(307);
    expect(pageRes.headers.get('location')).toMatch(/\/$/);

    // Admin API route returns 403
    const adminApiReq = new NextRequest('https://example.com/api/admin/users', {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${viewerToken}` },
    });
    const apiRes = await middleware(adminApiReq);
    expect(apiRes.status).toBe(403);
    const json = await apiRes.json();
    expect(json.error).toContain('فقط برای مدیر سیستم');
  });

  it('redirects admin from root / to /admin dashboard', async () => {
    const adminToken = await signAuthToken({ id: 1, username: 'admin', role: 'admin' });
    const req = new NextRequest('https://example.com/', {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${adminToken}` },
    });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/admin');
  });
});

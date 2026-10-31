import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, verifyAuthToken } from '@/lib/jwt';
import { sanitizeInternalRedirect } from '@/lib/redirect';

const PUBLIC_FILE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.woff2', '.woff', '.ttf', '.ico'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Ignore static assets and Next.js internal static assets
  if (
    pathname.startsWith('/_next/static') ||
    pathname.startsWith('/_next/image') ||
    pathname === '/favicon.ico' ||
    PUBLIC_FILE_EXTENSIONS.some((ext) => pathname.endsWith(ext))
  ) {
    return NextResponse.next();
  }

  const isLoginPage = pathname === '/login';
  const isAuthLoginApi = pathname === '/api/auth/login';
  const isHealthApi = pathname === '/api/health';
  const isTriggerRunApi = pathname === '/api/trigger-run';

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = token ? await verifyAuthToken(token) : null;

  // If already authenticated and visits /login, redirect to dashboard or change-password
  if (isLoginPage && session) {
    const rawRedirect = req.nextUrl.searchParams.get('redirect');
    const defaultTarget = session.must_change_password
      ? '/change-password'
      : session.role === 'admin'
      ? '/admin'
      : '/';
    const redirectUrl = sanitizeInternalRedirect(rawRedirect, defaultTarget);
    return NextResponse.redirect(new URL(redirectUrl, req.url));
  }

  // Allow login page, login API endpoint, health check, and trigger-run (which validates its own API key) without session
  if (isLoginPage || isAuthLoginApi || isHealthApi || isTriggerRunApi) {
    return NextResponse.next();
  }

  // If unauthenticated:
  if (!session) {
    const isApiRequest =
      pathname.startsWith('/api/') ||
      pathname.startsWith('/admin/run-now') ||
      pathname.startsWith('/admin/config/') ||
      req.headers.get('accept')?.includes('application/json');

    if (isApiRequest) {
      return NextResponse.json({ error: 'برای دسترسی ابتدا باید وارد شوید.' }, { status: 401 });
    }

    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If user must change password, restrict access strictly to change-password endpoints
  if (session.must_change_password) {
    const isAllowed =
      pathname === '/change-password' ||
      pathname === '/api/auth/change-password' ||
      pathname === '/api/auth/logout' ||
      pathname === '/api/auth/me';

    if (!isAllowed) {
      const isApiRequest =
        pathname.startsWith('/api/') ||
        pathname.startsWith('/admin/run-now') ||
        pathname.startsWith('/admin/config/') ||
        req.headers.get('accept')?.includes('application/json');

      if (isApiRequest) {
        return NextResponse.json(
          { error: 'الزام تغییر کلمه عبور: لطفاً ابتدا کلمه عبور خود را تغییر دهید.' },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL('/change-password', req.url));
    }
    return NextResponse.next();
  }


  // If authenticated admin visits root '/', redirect to '/admin' so they land directly on admin dashboard
  if (pathname === '/' && session.role === 'admin') {
    return NextResponse.redirect(new URL('/admin', req.url));
  }

  // If authenticated admin visits /runs, redirect to /admin/runs
  if ((pathname === '/runs' || pathname.startsWith('/runs/')) && session.role === 'admin') {
    return NextResponse.redirect(new URL('/admin/runs', req.url));
  }

  // Role check: /admin/*, /api/admin/*, or /runs require 'admin' role
  const isAdminPath =
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/api/admin/') ||
    pathname === '/runs' ||
    pathname.startsWith('/runs/');
  if (isAdminPath && session.role !== 'admin') {
    const isApiRequest =
      pathname.startsWith('/api/') ||
      pathname.startsWith('/admin/run-now') ||
      pathname.startsWith('/admin/config/') ||
      req.headers.get('accept')?.includes('application/json');

    if (isApiRequest) {
      return NextResponse.json({ error: 'دسترسی فقط برای مدیر سیستم مجاز است.' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

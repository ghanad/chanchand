import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest, hashPassword } from '@/lib/auth';
import { countUsers, createUser, getDatabase, getUserByUsername, listUsers } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthUserFromRequest(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'دسترسی غیرمجاز. فقط مدیران سیستم مجاز هستند.' }, { status: 403 });
    }

    const db = getDatabase();
    const users = listUsers(db);
    return NextResponse.json({ users, total: users.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطا در دریافت لیست کاربران' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthUserFromRequest(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'دسترسی غیرمجاز. فقط مدیران سیستم مجاز هستند.' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const username = body?.username?.trim();
    const password = body?.password;
    const role = body?.role === 'admin' ? 'admin' : 'viewer';
    const email = body?.email ? String(body.email).trim() : null;
    const mustChangePassword = Boolean(body?.must_change_password);

    if (!username || username.length < 3) {
      return NextResponse.json({ error: 'نام کاربری باید حداقل ۳ کاراکتر باشد.' }, { status: 400 });
    }

    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'کلمه عبور باید حداقل ۶ کاراکتر باشد.' }, { status: 400 });
    }

    const db = getDatabase();
    const existing = getUserByUsername(db, username);
    if (existing) {
      return NextResponse.json({ error: 'این نام کاربری قبلاً ثبت شده است.' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const newUser = createUser(db, {
      username,
      password_hash: passwordHash,
      role,
      email,
      must_change_password: mustChangePassword,
    });

    return NextResponse.json({ success: true, user: newUser }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطا در ایجاد کاربر جدید' }, { status: 500 });
  }
}

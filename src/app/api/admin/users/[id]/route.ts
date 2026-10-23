import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest, hashPassword } from '@/lib/auth';
import { deleteUser, getDatabase, getUserById, updateUser } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthUserFromRequest(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'دسترسی غیرمجاز.' }, { status: 403 });
    }

    const { id: rawId } = await params;
    const userId = parseInt(rawId, 10);
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'شناسه کاربر نامعتبر است.' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const db = getDatabase();

    const existing = getUserById(db, userId);
    if (!existing) {
      return NextResponse.json({ error: 'کاربر مورد نظر یافت نشد.' }, { status: 404 });
    }

    const updateParams: {
      password_hash?: string;
      role?: 'admin' | 'viewer';
      email?: string | null;
      must_change_password?: boolean;
    } = {};

    if (body.role && (body.role === 'admin' || body.role === 'viewer')) {
      updateParams.role = body.role;
    }

    if (body.email !== undefined) {
      updateParams.email = body.email ? String(body.email).trim() : null;
    }

    if (body.must_change_password !== undefined) {
      updateParams.must_change_password = Boolean(body.must_change_password);
    }

    if (body.password) {
      if (String(body.password).length < 6) {
        return NextResponse.json({ error: 'کلمه عبور جدید باید حداقل ۶ کاراکتر باشد.' }, { status: 400 });
      }
      updateParams.password_hash = await hashPassword(body.password);
    }

    const updated = updateUser(db, userId, updateParams);
    return NextResponse.json({ success: true, user: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطا در ویرایش کاربر' }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthUserFromRequest(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'دسترسی غیرمجاز.' }, { status: 403 });
    }

    const { id: rawId } = await params;
    const userId = parseInt(rawId, 10);
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'شناسه کاربر نامعتبر است.' }, { status: 400 });
    }

    if (session.id === userId) {
      return NextResponse.json({ error: 'امکان حذف حساب کاربری خودتان وجود ندارد.' }, { status: 400 });
    }

    const db = getDatabase();
    deleteUser(db, userId);

    return NextResponse.json({ success: true, message: 'کاربر با موفقیت حذف شد.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطا در حذف کاربر' }, { status: 400 });
  }
}

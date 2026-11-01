import { NextRequest, NextResponse } from 'next/server';
import {
  getDatabase,
  getUserById,
  getPackageById,
  createPaymentTransaction,
  updatePaymentTransactionAuthority,
} from '@/lib/db';
import { requireAuth } from '@/lib/api-guard';
import { getPaymentGateway } from '@/lib/payment';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const body = await req.json().catch(() => ({}));
    const packageId = Number(body?.packageId);
    if (!packageId || isNaN(packageId)) {
      return NextResponse.json({ error: 'شناسه بسته (packageId) نامعتبر است.' }, { status: 400 });
    }

    const db = getDatabase();
    const pkg = getPackageById(db, packageId);
    if (!pkg || !pkg.is_active) {
      return NextResponse.json({ error: 'بسته انتخاب‌شده یافت نشد یا غیرفعال است.' }, { status: 404 });
    }

    const gateway = getPaymentGateway(body.gateway);

    // 1. Create pending transaction in DB
    const txn = createPaymentTransaction(db, {
      user_id: auth.user.id,
      package_id: pkg.id,
      package_title: pkg.title,
      slots: pkg.slots,
      amount_toman: pkg.price_toman,
      gateway: gateway.name,
    });

    // 2. Determine absolute callback URL
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:8000';
    const proto = req.headers.get('x-forwarded-proto') || (req.url.startsWith('https') ? 'https' : 'http');
    const callbackUrl = `${proto}://${host}/api/payments/callback`;

    const dbUser = getUserById(db, auth.user.id);

    // 3. Initiate payment with the gateway
    const result = await gateway.createPayment({
      transactionId: txn.id,
      amountToman: pkg.price_toman,
      description: `خرید ${pkg.title} برای کاربر ${auth.user.username}`,
      callbackUrl,
      userEmail: dbUser?.email,
      userMobile: dbUser?.mobile,
    });

    // 4. Update transaction with authority
    updatePaymentTransactionAuthority(db, txn.id, result.authority, result.rawResponse);

    return NextResponse.json({
      success: true,
      transactionId: txn.id,
      gatewayUrl: result.gatewayUrl,
      authority: result.authority,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'خطا در ایجاد درخواست پرداخت' },
      { status: 500 }
    );
  }
}

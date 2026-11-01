import { NextRequest, NextResponse } from 'next/server';
import {
  getDatabase,
  getPaymentTransactionByAuthority,
  markPaymentTransactionPaid,
  markPaymentTransactionFailed,
} from '@/lib/db';
import { getPaymentGateway } from '@/lib/payment';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handleCallback(req);
}

export async function POST(req: NextRequest) {
  return handleCallback(req);
}

async function handleCallback(req: NextRequest) {
  const url = new URL(req.url);
  const searchParams = url.searchParams;

  let body: Record<string, any> = {};
  if (req.method === 'POST') {
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await req.json().catch(() => ({}));
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData().catch(() => null);
      if (formData) {
        formData.forEach((value, key) => {
          body[key] = value.toString();
        });
      }
    }
  }

  const authority =
    searchParams.get('Authority') ||
    searchParams.get('authority') ||
    body.Authority ||
    body.authority ||
    '';

  const statusParam = (
    searchParams.get('Status') ||
    searchParams.get('status') ||
    body.Status ||
    body.status ||
    ''
  ).toUpperCase();

  const redirectBase = new URL('/account', req.url);
  redirectBase.searchParams.set('tab', 'payments');

  if (!authority) {
    redirectBase.searchParams.set('payment_status', 'failed');
    redirectBase.searchParams.set('message', 'شناسه تراکنش نامعتبر است.');
    return NextResponse.redirect(redirectBase);
  }

  const db = getDatabase();
  const txn = getPaymentTransactionByAuthority(db, authority);

  if (!txn) {
    redirectBase.searchParams.set('payment_status', 'failed');
    redirectBase.searchParams.set('message', 'تراکنش پرداخت در سیستم یافت نشد.');
    return NextResponse.redirect(redirectBase);
  }

  // Idempotency: if already paid, do not verify or add slots again
  if (txn.status === 'paid') {
    redirectBase.searchParams.set('payment_status', 'success');
    redirectBase.searchParams.set('message', 'این تراکنش قبلاً با موفقیت پرداخت و اعمال شده است.');
    if (txn.ref_id) redirectBase.searchParams.set('ref_id', txn.ref_id);
    return NextResponse.redirect(redirectBase);
  }

  // Check if gateway explicitly returned failure
  if (statusParam === 'NOK' || statusParam === 'FAILED' || statusParam === 'CANCELED') {
    markPaymentTransactionFailed(db, txn.id, {
      statusParam,
      message: 'کاربر پرداخت را لغو کرد یا درگاه خطا داد.',
    });
    redirectBase.searchParams.set('payment_status', 'failed');
    redirectBase.searchParams.set('message', 'پرداخت لغو شد یا انجام نشد.');
    return NextResponse.redirect(redirectBase);
  }

  try {
    const gateway = getPaymentGateway(txn.gateway);
    const queryMap: Record<string, string> = {};
    searchParams.forEach((v, k) => {
      queryMap[k] = v;
    });

    const verifyResult = await gateway.verifyPayment({
      authority,
      amountToman: txn.amount_toman,
      query: { ...queryMap, ...body },
    });

    if (verifyResult.success) {
      const refId = verifyResult.refId || `REF-${Date.now()}`;
      markPaymentTransactionPaid(db, txn.id, refId, verifyResult.rawResponse);

      redirectBase.searchParams.set('payment_status', 'success');
      redirectBase.searchParams.set('ref_id', refId);
      redirectBase.searchParams.set('slots', String(txn.slots));
      redirectBase.searchParams.set(
        'message',
        `پرداخت با موفقیت انجام شد و ${txn.slots} اسلات پایش به حساب شما افزوده شد.`
      );
      return NextResponse.redirect(redirectBase);
    } else {
      markPaymentTransactionFailed(db, txn.id, verifyResult.rawResponse);
      redirectBase.searchParams.set('payment_status', 'failed');
      redirectBase.searchParams.set(
        'message',
        verifyResult.message || 'تایید پرداخت توسط درگاه انجام نشد.'
      );
      return NextResponse.redirect(redirectBase);
    }
  } catch (err: any) {
    markPaymentTransactionFailed(db, txn.id, { error: err.message });
    redirectBase.searchParams.set('payment_status', 'failed');
    redirectBase.searchParams.set('message', err.message || 'خطا در تایید تراکنش');
    return NextResponse.redirect(redirectBase);
  }
}

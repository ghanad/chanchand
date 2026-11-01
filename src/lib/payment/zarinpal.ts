import {
  PaymentGateway,
  PaymentRequestParams,
  PaymentRequestResult,
  PaymentVerifyParams,
  PaymentVerifyResult,
} from './types';

export interface ZarinpalConfig {
  merchantId?: string;
  isSandbox?: boolean;
}

export class ZarinpalPaymentGateway implements PaymentGateway {
  readonly name = 'zarinpal';
  private merchantId: string;
  private isSandbox: boolean;

  constructor(config?: ZarinpalConfig) {
    this.merchantId = config?.merchantId || process.env.ZARINPAL_MERCHANT_ID || '';
    this.isSandbox =
      config?.isSandbox ??
      (process.env.ZARINPAL_SANDBOX === 'true' || !this.merchantId || this.merchantId === 'sandbox');
  }

  private get baseUrl(): string {
    return this.isSandbox
      ? 'https://sandbox.zarinpal.com/pg'
      : 'https://payment.zarinpal.com/pg';
  }

  async createPayment(params: PaymentRequestParams): Promise<PaymentRequestResult> {
    const merchantId = this.merchantId || '00000000-0000-0000-0000-000000000000';
    const endpoint = `${this.baseUrl}/v4/payment/request.json`;

    const metadata: Record<string, string> = {};
    if (params.userEmail) metadata.email = params.userEmail;
    if (params.userMobile) metadata.mobile = params.userMobile;

    const payload = {
      merchant_id: merchantId,
      amount: params.amountToman,
      currency: 'IRT',
      description: params.description,
      callback_url: params.callbackUrl,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data?.data?.authority || (data?.data?.code !== 100 && data?.data?.code !== 101)) {
      const errDetail =
        data?.errors?.message ||
        (Array.isArray(data?.errors) ? JSON.stringify(data.errors) : null) ||
        data?.data?.message ||
        `خطا در ارتباط با درگاه زرین‌پال (کد: ${data?.data?.code || res.status})`;
      throw new Error(`خطای زرین‌پال: ${errDetail}`);
    }

    const authority = data.data.authority;
    const gatewayUrl = `${this.baseUrl}/StartPay/${authority}`;

    return {
      gatewayUrl,
      authority,
      rawResponse: data,
    };
  }

  async verifyPayment(params: PaymentVerifyParams): Promise<PaymentVerifyResult> {
    const merchantId = this.merchantId || '00000000-0000-0000-0000-000000000000';
    const endpoint = `${this.baseUrl}/v4/payment/verify.json`;

    const payload = {
      merchant_id: merchantId,
      amount: params.amountToman,
      authority: params.authority,
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    const code = data?.data?.code;
    const isSuccess = code === 100 || code === 101;

    if (!isSuccess) {
      const message =
        data?.errors?.message ||
        (Array.isArray(data?.errors) ? JSON.stringify(data.errors) : null) ||
        data?.data?.message ||
        `تراکنش تایید نشد (کد: ${code || res.status})`;
      return {
        success: false,
        message,
        rawResponse: data,
      };
    }

    return {
      success: true,
      refId: String(data.data.ref_id || ''),
      cardNumberMasked: data.data.card_pan,
      message: data.data.message || 'پرداخت با موفقیت انجام شد.',
      rawResponse: data,
    };
  }
}

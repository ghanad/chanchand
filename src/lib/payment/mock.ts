import {
  PaymentGateway,
  PaymentRequestParams,
  PaymentRequestResult,
  PaymentVerifyParams,
  PaymentVerifyResult,
} from './types';

export class MockPaymentGateway implements PaymentGateway {
  readonly name = 'mock';

  async createPayment(params: PaymentRequestParams): Promise<PaymentRequestResult> {
    const authority = `MOCK-AUTH-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    const separator = params.callbackUrl.includes('?') ? '&' : '?';
    const gatewayUrl = `${params.callbackUrl}${separator}Authority=${encodeURIComponent(
      authority
    )}&Status=OK`;

    return {
      gatewayUrl,
      authority,
      rawResponse: { mock: true, transactionId: params.transactionId },
    };
  }

  async verifyPayment(params: PaymentVerifyParams): Promise<PaymentVerifyResult> {
    if (params.authority.startsWith('FAIL') || params.query?.Status === 'NOK') {
      return {
        success: false,
        message: 'پرداخت توسط کاربر لغو شد یا درگاه خطا داد.',
        rawResponse: { mock: true, status: 'NOK' },
      };
    }

    const refId = `REF-${Math.floor(10000000 + Math.random() * 90000000)}`;
    return {
      success: true,
      refId,
      cardNumberMasked: '۶۰۳۷-۹۹**-****-۵۴۳۲',
      message: 'پرداخت آزمایشی با موفقیت تایید شد.',
      rawResponse: { mock: true, refId, status: 'OK' },
    };
  }
}

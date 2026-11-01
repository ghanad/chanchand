export interface PaymentRequestParams {
  transactionId: number;
  amountToman: number;
  description: string;
  callbackUrl: string;
  userEmail?: string | null;
  userMobile?: string | null;
}

export interface PaymentRequestResult {
  gatewayUrl: string;
  authority: string;
  rawResponse?: any;
}

export interface PaymentVerifyParams {
  authority: string;
  amountToman: number;
  query?: Record<string, string>;
}

export interface PaymentVerifyResult {
  success: boolean;
  refId?: string;
  cardNumberMasked?: string;
  message?: string;
  rawResponse?: any;
}

export interface PaymentGateway {
  readonly name: string;
  createPayment(params: PaymentRequestParams): Promise<PaymentRequestResult>;
  verifyPayment(params: PaymentVerifyParams): Promise<PaymentVerifyResult>;
}

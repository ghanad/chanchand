import { PaymentGateway } from './types';
import { ZarinpalPaymentGateway } from './zarinpal';
import { MockPaymentGateway } from './mock';

export * from './types';
export * from './zarinpal';
export * from './mock';

export function getPaymentGateway(preferredName?: string): PaymentGateway {
  const chosen = (preferredName || process.env.PAYMENT_GATEWAY || '').toLowerCase();

  if (chosen === 'mock') {
    return new MockPaymentGateway();
  }

  if (chosen === 'zarinpal') {
    return new ZarinpalPaymentGateway();
  }

  // If in automated test environment or neither is explicitly set and no merchant id
  if (process.env.NODE_ENV === 'test') {
    return new MockPaymentGateway();
  }

  // Default to Zarinpal gateway
  return new ZarinpalPaymentGateway();
}

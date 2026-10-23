import { PriceAdapter } from './types';
import { DigikalaApiAdapter } from './digikalaApi';
import { DigikalaWebAdapter } from './digikalaWeb';
import { BrsapiMarketAdapter } from './brsapiMarket';
import { ServixMarketAdapter } from './servixMarket';
import { GenericHtmlAdapter } from './genericHtml';

export * from './types';
export * from './digikalaApi';
export * from './digikalaWeb';
export * from './brsapiMarket';
export * from './servixMarket';
export * from './genericHtml';

const adapters: Record<string, () => PriceAdapter> = {
  generic_html: () => new GenericHtmlAdapter(),
  digikala: () => new DigikalaApiAdapter(),
  digikala_api: () => new DigikalaApiAdapter(),
  digikala_web: () => new DigikalaWebAdapter(),
  brsapi_market: () => new BrsapiMarketAdapter(),
  servix_market: () => new ServixMarketAdapter(),
};

export function getAdapter(name: string): PriceAdapter {
  const factory = adapters[name];
  if (!factory) {
    throw new Error(`unknown adapter: ${name}`);
  }
  return factory();
}

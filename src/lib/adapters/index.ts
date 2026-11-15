import { PriceAdapter } from './types';
import { DigikalaApiAdapter } from './digikalaApi';
import { DigikalaWebAdapter } from './digikalaWeb';
import { BrsapiMarketAdapter } from './brsapiMarket';
import { ServixMarketAdapter } from './servixMarket';
import { GenericHtmlAdapter } from './genericHtml';
import { IranjibAdapter } from './iranjib';

export * from './types';
export * from './digikalaApi';
export * from './digikalaWeb';
export * from './brsapiMarket';
export * from './servixMarket';
export * from './genericHtml';
export * from './iranjib';

const adapters: Record<string, () => PriceAdapter> = {
  generic_html: () => new GenericHtmlAdapter(),
  digikala: () => new DigikalaApiAdapter(),
  digikala_api: () => new DigikalaApiAdapter(),
  digikala_web: () => new DigikalaWebAdapter(),
  brsapi_market: () => new BrsapiMarketAdapter(),
  servix_market: () => new ServixMarketAdapter(),
  iranjib: () => new IranjibAdapter(),
  iranjib_car: () => new IranjibAdapter(),
};

/**
 * Adapter instances are shared for the lifetime of the process so their
 * response caches survive between targets and runs. Market adapters answer with
 * the *whole* market snapshot in one HTTP response, so sharing the instance is
 * what turns N market products into a single API request (critical for providers
 * with a small daily quota).
 */
const instances: Record<string, PriceAdapter> = {};

export function getAdapter(name: string): PriceAdapter {
  const factory = adapters[name];
  if (!factory) {
    throw new Error(`unknown adapter: ${name}`);
  }

  let adapter = instances[name];
  if (!adapter) {
    adapter = factory();
    instances[name] = adapter;
  }
  return adapter;
}

/** Clears cached adapter instances (used by tests that swap `globalThis.fetch`). */
export function resetAdapterInstances(): void {
  for (const key of Object.keys(instances)) {
    delete instances[key];
  }
}

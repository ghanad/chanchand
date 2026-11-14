import { describe, it, expect } from 'vitest';
import { isAlwaysOnMarketProduct, isMarketSource } from '../src/lib/market';

describe('market product detection', () => {
  it('recognizes market sources', () => {
    expect(isMarketSource('servix_market')).toBe(true);
    expect(isMarketSource('brsapi_market')).toBe(true);
    expect(isMarketSource('x_market_y')).toBe(true);
    expect(isMarketSource('digikala_api')).toBe(false);
    expect(isMarketSource(undefined)).toBe(false);
    expect(isMarketSource('foo', 'servix_market')).toBe(true);
  });

  it('treats known market product keys as always-on', () => {
    expect(isAlwaysOnMarketProduct({ key: 'usd' })).toBe(true);
    expect(isAlwaysOnMarketProduct({ key: 'gold-18k' })).toBe(true);
    expect(isAlwaysOnMarketProduct({ key: 'smart-air-purifier-6' })).toBe(false);
  });

  it('detects always-on products from their sources', () => {
    expect(isAlwaysOnMarketProduct({ key: 'custom', sources: ['servix_market'] })).toBe(true);
    expect(isAlwaysOnMarketProduct({ key: 'custom', sources: ['digikala_api'] })).toBe(false);
    expect(
      isAlwaysOnMarketProduct({
        key: 'custom',
        primary_target: { source_key: 'brsapi_market' },
      })
    ).toBe(true);
  });
});

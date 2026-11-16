import { describe, it, expect } from 'vitest';
import { normalizeTargetUrl, getTargetDeduplicationKey } from '../src/lib/urls';

describe('normalizeTargetUrl', () => {
  it('canonicalizes Digikala URLs with different slugs and UTM tracking parameters', () => {
    const urlA = 'https://www.digikala.com/product/dkp-1234567/samsung-galaxy-s24/';
    const urlB = 'https://www.digikala.com/product/dkp-1234567/?utm_source=telegram&utm_medium=cpc';
    const urlC = 'https://digikala.com/product/1234567#reviews';

    const normA = normalizeTargetUrl(urlA);
    const normB = normalizeTargetUrl(urlB);
    const normC = normalizeTargetUrl(urlC);

    expect(normA).toBe('https://www.digikala.com/product/dkp-1234567/');
    expect(normB).toBe('https://www.digikala.com/product/dkp-1234567/');
    expect(normC).toBe('https://www.digikala.com/product/dkp-1234567/');
  });

  it('drops Digikala variant_id so a shared colour link does not fork the product', () => {
    const urlWithVariant = 'https://www.digikala.com/product/dkp-55555/slug/?product_id=55555&variant_id=9876&utm_campaign=winter';
    expect(normalizeTargetUrl(urlWithVariant)).toBe('https://www.digikala.com/product/dkp-55555/');
  });

  it('strips tracking parameters and trailing slashes for generic ecommerce URLs', () => {
    const url1 = 'https://shop.example.com/items/laptop/?utm_source=google&fbclid=abc123xyz/';
    const url2 = 'https://shop.example.com/items/laptop';
    expect(normalizeTargetUrl(url1)).toBe('https://shop.example.com/items/laptop');
    expect(normalizeTargetUrl(url2)).toBe('https://shop.example.com/items/laptop');
  });
});

describe('getTargetDeduplicationKey', () => {
  it('uses normalized URL as deduplication key for standard ecommerce targets', () => {
    const url = 'https://www.digikala.com/product/dkp-11111/slug/?utm_source=social';
    const key = getTargetDeduplicationKey('digikala_api', url);
    expect(key).toBe('https://www.digikala.com/product/dkp-11111/');
  });

  it('includes sourceKey and symbol for multi-item market sources', () => {
    const url = 'https://servix.cc/api/v1/assets';
    const keyGold = getTargetDeduplicationKey('servix_market', url, { symbol: 'GOLD_18_RLS' });
    const keyUsd = getTargetDeduplicationKey('servix_market', url, { symbol: 'USD_RLS' });

    expect(keyGold).toBe('servix_market::https://servix.cc/api/v1/assets::GOLD_18_RLS');
    expect(keyUsd).toBe('servix_market::https://servix.cc/api/v1/assets::USD_RLS');
    expect(keyGold).not.toBe(keyUsd);
  });

  it('includes item_name for Iranjib catalog URLs', () => {
    const url = 'https://www.iranjib.ir/showgroup/45/prices/';
    const keyCar1 = getTargetDeduplicationKey('iranjib', url, { item_name: 'پژو ۲۰۷ دستی' });
    const keyCar2 = getTargetDeduplicationKey('iranjib', url, { item_name: 'دنا پلاس توربو' });

    expect(keyCar1).toBe('iranjib::https://www.iranjib.ir/showgroup/45/prices::پژو ۲۰۷ دستی');
    expect(keyCar2).toBe('iranjib::https://www.iranjib.ir/showgroup/45/prices::دنا پلاس توربو');
    expect(keyCar1).not.toBe(keyCar2);
  });

  it('separates Digikala colours of the same product page', () => {
    const url = 'https://www.digikala.com/product/dkp-11111/';
    const floor = getTargetDeduplicationKey('digikala_api', url);
    const black = getTargetDeduplicationKey('digikala_api', url, undefined, '82');
    const white = getTargetDeduplicationKey('digikala_api', url, undefined, '83');

    expect(floor).toBe('https://www.digikala.com/product/dkp-11111/');
    expect(black).toBe('https://www.digikala.com/product/dkp-11111/::variant:82');
    expect(black).not.toBe(white);
    expect(black).not.toBe(floor);
  });
});

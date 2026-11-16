import { describe, it, expect } from 'vitest';
import {
  collectVariants,
  isMarketableVariant,
  pickVariant,
  summarizeVariants,
} from '../src/lib/digikalaVariants';

function product(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    title_fa: 'گوشی موبایل',
    variants: [
      {
        id: 101,
        color: { id: 82, title: 'زرد لیمویی', hex_code: '#FFF9C4' },
        status: 'marketable',
        seller: { title: 'فروشنده الف' },
        price: { selling_price: 1041735000 },
      },
      {
        id: 102,
        color: { id: 82, title: 'زرد لیمویی', hex_code: '#FFF9C4' },
        status: 'marketable',
        seller: { title: 'فروشنده ب' },
        price: { selling_price: 1080000000 },
      },
      {
        id: 103,
        color: { id: 83, title: 'مشکی', hex_code: '#000000' },
        status: 'marketable',
        seller: { title: 'فروشنده ج' },
        price: { selling_price: 1059000000 },
      },
      {
        id: 104,
        color: { id: 84, title: 'بنفش', hex_code: '#800080' },
        status: 'not_marketable',
        seller: { title: 'فروشنده د' },
        price: { selling_price: 900000000 },
      },
    ],
    ...overrides,
  };
}

describe('collectVariants', () => {
  it('includes default_variant and de-duplicates by id', () => {
    const variants = collectVariants(
      product({
        default_variant: {
          id: 101,
          color: { id: 82, title: 'زرد لیمویی' },
          status: 'marketable',
          price: { selling_price: 1041735000 },
        },
      }),
      1
    );
    expect(variants).toHaveLength(4);
    expect(variants.filter((v) => v.id === '101')).toHaveLength(1);
  });
});

describe('isMarketableVariant', () => {
  it('treats unknown status as marketable when a price exists', () => {
    expect(isMarketableVariant({ price: { selling_price: 1000 } })).toBe(true);
    expect(isMarketableVariant({ price: { selling_price: 1000 }, status: 'not_marketable' })).toBe(false);
    expect(isMarketableVariant({ price: { selling_price: 1000 }, status: 'marketable' })).toBe(true);
    expect(isMarketableVariant({})).toBe(false);
  });
});

describe('summarizeVariants', () => {
  it('reports the cheapest marketable offer per colour and overall', () => {
    const summary = summarizeVariants(product(), 1);

    const lemon = summary.colors.find((c) => c.id === '82');
    expect(lemon).toMatchObject({ label: 'زرد لیمویی', priceIrr: 1041735000, sellerCount: 2, inStock: true });

    const purple = summary.colors.find((c) => c.id === '84');
    expect(purple).toMatchObject({ inStock: false, priceIrr: null });

    expect(summary.floor.priceIrr).toBe(1041735000);
    expect(summary.floor.colorLabel).toBe('زرد لیمویی');
    expect(summary.floor.inStock).toBe(true);
  });
});

describe('pickVariant', () => {
  it('picks the cheapest marketable offer when no colour is requested', () => {
    const picked = pickVariant(product(), { multiplier: 1 });
    expect(picked.priceIrr).toBe(1041735000);
    expect(picked.variant?.id).toBe('101');
    expect(picked.availability).toBe('in_stock');
  });

  it('picks the cheapest offer of the requested colour', () => {
    const picked = pickVariant(product(), { colorId: '83', multiplier: 1 });
    expect(picked.priceIrr).toBe(1059000000);
    expect(picked.variant?.colorLabel).toBe('مشکی');
  });

  it('reports out_of_stock when the colour has no marketable offer', () => {
    const picked = pickVariant(product(), { colorId: '84', multiplier: 1 });
    expect(picked.priceIrr).toBeNull();
    expect(picked.availability).toBe('out_of_stock');
    expect(picked.colorExists).toBe(true);
  });

  it('flags a colour that disappeared from the product', () => {
    const picked = pickVariant(product(), { colorId: '999', multiplier: 1 });
    expect(picked.priceIrr).toBeNull();
    expect(picked.availability).toBe('out_of_stock');
    expect(picked.colorExists).toBe(false);
  });

  it('applies the source price multiplier', () => {
    const picked = pickVariant(product(), { multiplier: 10 });
    expect(picked.priceIrr).toBe(10417350000);
  });
});

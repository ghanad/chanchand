import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDatabase, addManagedProduct, getManagedTargets } from '../src/lib/db';
import { buildDigikalaPreview } from '../src/lib/digikalaProduct';
import { SourceConfig } from '../src/lib/types';

const SOURCE: SourceConfig = {
  adapter: 'digikala_api',
  timeout_seconds: 10,
  rate_limit_seconds: 5,
  currency: 'IRR',
  price_multiplier: 1,
  headers: {},
  settings: {},
};

const URL = 'https://www.digikala.com/product/dkp-18577783/';

describe('colour is part of the tracked product identity', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initDatabase(db);
  });

  afterEach(() => {
    db.close();
  });

  it('reuses the product when the same colour is added twice', () => {
    const first = addManagedProduct(db, { title: 'گوشی', url: URL, color_id: '82', color_label: 'زرد لیمویی' });
    const second = addManagedProduct(db, { title: 'گوشی', url: URL, color_id: '82', color_label: 'زرد لیمویی' });

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.product_key).toBe(first.product_key);
  });

  it('creates a separate product per colour', () => {
    const lemon = addManagedProduct(db, { title: 'گوشی', url: URL, color_id: '82', color_label: 'زرد لیمویی' });
    const white = addManagedProduct(db, { title: 'گوشی', url: URL, color_id: '83', color_label: 'سفید' });

    expect(white.reused).toBe(false);
    expect(white.product_key).not.toBe(lemon.product_key);
  });

  it('keeps the "cheapest anywhere" product separate from a pinned colour', () => {
    const floor = addManagedProduct(db, { title: 'گوشی', url: URL });
    const white = addManagedProduct(db, { title: 'گوشی', url: URL, color_id: '83', color_label: 'سفید' });

    expect(white.product_key).not.toBe(floor.product_key);
  });

  it('stores the colour on the target and appends it to the title', () => {
    const { product_key } = addManagedProduct(db, {
      title: 'گوشی سامسونگ',
      url: URL,
      color_id: '82',
      color_label: 'زرد لیمویی',
    });

    const target = getManagedTargets(db, product_key)[0];
    expect(target.color_id).toBe('82');
    expect(target.color_label).toBe('زرد لیمویی');

    const product = db.prepare('SELECT title FROM managed_products WHERE key = ?').get(product_key) as { title: string };
    expect(product.title).toBe('گوشی سامسونگ - زرد لیمویی');
  });

  it('does not duplicate the colour in the title when it is already there', () => {
    const { product_key } = addManagedProduct(db, {
      title: 'گوشی سامسونگ - سفید',
      url: URL,
      color_id: '83',
      color_label: 'سفید',
    });
    const product = db.prepare('SELECT title FROM managed_products WHERE key = ?').get(product_key) as { title: string };
    expect(product.title).toBe('گوشی سامسونگ - سفید');
  });
});

describe('buildDigikalaPreview', () => {
  const product = {
    id: 18577783,
    title_fa: 'گوشی موبایل سامسونگ',
    brand: { title_fa: 'سامسونگ' },
    images: { main: { url: ['https://img.example.com/a.jpg'] } },
    variants: [
      {
        id: 1,
        color: { id: 82, title: 'زرد لیمویی', hex_code: '#FFF9C4' },
        status: 'marketable',
        seller: { title: 'فروشنده الف' },
        price: { selling_price: 1041735000 },
      },
      {
        id: 2,
        color: { id: 83, title: 'سفید', hex_code: '#FFFFFF' },
        status: 'marketable',
        seller: { title: 'فروشنده ب' },
        price: { selling_price: 1069720000 },
      },
      {
        id: 3,
        color: { id: 84, title: 'بنفش', hex_code: '#800080' },
        status: 'not_marketable',
        seller: { title: 'فروشنده ج' },
        price: { selling_price: 900000000 },
      },
    ],
  };

  it('summarizes title, floor price and colours for the add-product modal', () => {
    const preview = buildDigikalaPreview(product, SOURCE, '18577783');

    expect(preview.title).toBe('گوشی موبایل سامسونگ');
    expect(preview.brand).toBe('سامسونگ');
    expect(preview.image_url).toBe('https://img.example.com/a.jpg');
    expect(preview.floor_price_irr).toBe(1041735000);
    expect(preview.floor_color_label).toBe('زرد لیمویی');
    expect(preview.in_stock).toBe(true);

    expect(preview.colors).toHaveLength(3);
    const purple = preview.colors.find((c) => c.id === '84');
    expect(purple).toMatchObject({ inStock: false, priceIrr: null });
  });
});

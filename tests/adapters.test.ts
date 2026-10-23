import { describe, it, expect } from 'vitest';
import { DigikalaApiAdapter } from '../src/lib/adapters/digikalaApi';
import { DigikalaWebAdapter } from '../src/lib/adapters/digikalaWeb';
import { GenericHtmlAdapter } from '../src/lib/adapters/genericHtml';
import { BrsapiMarketAdapter } from '../src/lib/adapters/brsapiMarket';
import { ServixMarketAdapter } from '../src/lib/adapters/servixMarket';

describe('adapters', () => {
  it('parses generic HTML with css selectors', () => {
    const adapter = new GenericHtmlAdapter();
    const html = `
      <html>
        <body>
          <h1 class="title">گوشی موبایل مدل X</h1>
          <div class="price">۱۲,۵۰۰,۰۰۰ تومان</div>
          <div class="seller">فروشگاه اصلی</div>
          <span class="stock">موجود در انبار</span>
        </body>
      </html>
    `;
    const obs = adapter.parse(
      html,
      {
        adapter: 'generic_html',
        timeout_seconds: 10,
        rate_limit_seconds: 0,
        currency: 'TOMAN',
        price_multiplier: 10,
        headers: {},
        settings: {
          selectors: {
            title: 'h1.title',
            price: '.price',
            seller: '.seller',
            availability: '.stock',
          },
        },
      },
      {
        product_key: 'test',
        source_key: 'test',
        url: 'https://example.com',
        enabled: true,
      }
    );

    expect(obs.title).toBe('گوشی موبایل مدل X');
    expect(obs.price_irr).toBe(125000000);
    expect(obs.seller).toBe('فروشگاه اصلی');
    expect(obs.availability).toBe('in_stock');
  });

  it('parses Digikala API product structure', () => {
    const adapter = new DigikalaApiAdapter();
    const product = {
      id: 12345,
      title_fa: 'هدفون بی‌سیم',
      status: 'marketable',
      default_variant: {
        id: 999,
        price: {
          selling_price: 2500000,
        },
        seller: {
          title: 'دیجی‌کالا',
        },
      },
    };

    const obs = adapter.parseApiProduct(
      product,
      {
        adapter: 'digikala_api',
        timeout_seconds: 10,
        rate_limit_seconds: 0,
        currency: 'IRR',
        price_multiplier: 1,
        headers: {},
        settings: {},
      }
    );

    expect(obs.title).toBe('هدفون بی‌سیم');
    expect(obs.price_irr).toBe(2500000);
    expect(obs.seller).toBe('دیجی‌کالا');
    expect(obs.availability).toBe('in_stock');
  });

  it('parses BRSAPI payload', () => {
    const adapter = new BrsapiMarketAdapter();
    const payload = {
      gold: [
        {
          symbol: 'IR_GOLD_18K',
          name: 'طلای 18 عیار',
          price: 4500000,
          unit: 'تومان',
        },
      ],
      currency: [],
    };

    const obs = adapter.parseMarketPayload(
      payload,
      {
        adapter: 'brsapi_market',
        timeout_seconds: 10,
        rate_limit_seconds: 0,
        currency: 'TOMAN',
        price_multiplier: 10,
        headers: {},
        settings: {},
      },
      {
        product_key: 'gold-18k',
        source_key: 'brsapi_market',
        url: 'https://api.brsapi.ir',
        enabled: true,
        adapter_settings: {
          symbol: 'IR_GOLD_18K',
        },
      }
    );

    expect(obs.title).toBe('طلای 18 عیار');
    expect(obs.price_irr).toBe(45000000);
    expect(obs.availability).toBe('in_stock');
  });

  it('parses Servix payload', () => {
    const adapter = new ServixMarketAdapter();
    const payload = [
      {
        code: 'USD_RLS',
        name: 'USD_RLS',
        labelEn: 'US Dollar / Iranian Rial',
        labelFa: 'دلار آمریکا / ریال ایران',
        quoteUnit: 'RLS',
        value: 2719825,
        midPrice: 2719825,
      },
      {
        code: 'SEKKEH_RLS',
        name: 'SEKKEH_RLS',
        labelEn: 'Emami Coin / Iranian Rial',
        labelFa: 'سکه امامی / ریال ایران',
        quoteUnit: 'RLS',
        value: 2735930000,
        midPrice: 2735930000,
      },
    ];

    const obs = adapter.parseMarketPayload(
      payload,
      {
        adapter: 'servix_market',
        timeout_seconds: 10,
        rate_limit_seconds: 0,
        currency: 'IRR',
        price_multiplier: 1,
        headers: {},
        settings: {},
      },
      {
        product_key: 'usd',
        source_key: 'servix_market',
        url: 'https://servix.cc/api/v1/assets',
        enabled: true,
        adapter_settings: {
          symbol: 'USD_RLS',
        },
      }
    );

    expect(obs.title).toBe('دلار آمریکا / ریال ایران');
    expect(obs.price_irr).toBe(2719825);
    expect(obs.seller).toBe('Servix');
    expect(obs.availability).toBe('in_stock');
  });

  it('fetchWithCookieRedirect follows 307 redirects and forwards Set-Cookie headers', async () => {
    const { fetchWithCookieRedirect } = await import('../src/lib/adapters/fetchUtils');
    const originalFetch = globalThis.fetch;

    const calls: { url: string; cookie?: string | null }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({ url, cookie: headers.get('Cookie') });

      if (calls.length === 1) {
        return new Response('Redirecting', {
          status: 307,
          headers: {
            Location: 'https://api.digikala.com/v2/product/123/',
            'Set-Cookie': 'digicdn_cookie=abc12345; Path=/; Domain=.digikala.com',
          },
        });
      }

      return new Response(JSON.stringify({ status: 200, data: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    try {
      const res = await fetchWithCookieRedirect('https://api.digikala.com/v2/product/123/');
      expect(res.status).toBe(200);
      expect(calls.length).toBe(2);
      expect(calls[0].cookie).toBeNull();
      expect(calls[1].cookie).toBe('digicdn_cookie=abc12345');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});


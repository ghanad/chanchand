import { describe, it, expect, vi } from 'vitest';
import { DigikalaApiAdapter } from '../src/lib/adapters/digikalaApi';
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

  it('reports a Servix rate limit (429) with the retry-after window', async () => {
    const originalFetch = globalThis.fetch;
    const prevApiKey = process.env.SERVIX_API_KEY;
    process.env.SERVIX_API_KEY = 'test-servix-key';

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: 'Too Many Requests' }), {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Content-Type': 'application/json', 'Retry-After': '90' },
      })) as any;

    try {
      const adapter = new ServixMarketAdapter();
      let caught: any;
      try {
        await adapter.fetch({
          source: {
            adapter: 'servix_market',
            timeout_seconds: 10,
            rate_limit_seconds: 0,
            currency: 'IRR',
            price_multiplier: 1,
            headers: {},
            settings: {},
          },
          target: {
            product_key: 'coin-emami',
            source_key: 'servix_market',
            url: 'https://servix.cc/api/v1/assets',
            enabled: true,
            adapter_settings: { symbol: 'SEKKEH_RLS' },
          },
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(Error);
      expect(caught.name).toBe('HttpRequestError');
      expect(caught.status).toBe(429);
      expect(caught.retryAfterSeconds).toBe(90);
      expect(caught.responseExcerpt).toContain('Too Many Requests');
      expect(caught.message).toContain('Servix rate limit exceeded (HTTP 429 Too Many Requests)');
      expect(caught.message).toContain('retry after 90s');
      expect(caught.hint).toContain('rate_limit_seconds');
    } finally {
      globalThis.fetch = originalFetch;
      if (prevApiKey === undefined) delete process.env.SERVIX_API_KEY;
      else process.env.SERVIX_API_KEY = prevApiKey;
    }
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

describe('DigikalaApiAdapter endpoint failover', () => {
  const SOURCE: any = {
    adapter: 'digikala_api',
    timeout_seconds: 5,
    rate_limit_seconds: 0,
    currency: 'IRR',
    price_multiplier: 1,
    headers: {},
    settings: {},
  };

  const TARGET: any = {
    product_key: 'p',
    source_key: 'digikala_api',
    url: 'https://www.digikala.com/product/dkp-11801878/',
    enabled: true,
  };

  const productJson = JSON.stringify({
    status: 200,
    data: {
      product: {
        id: 11801878,
        title_fa: 'هدفون',
        variants: [
          {
            id: 1,
            color: { id: 5, title: 'مشکی' },
            status: 'marketable',
            price: { selling_price: 33004000 },
          },
        ],
      },
    },
  });

  it('uses the working v1 endpoint instead of the retired v2 one', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(String(url));
      if (String(url).includes('/v2/product/')) {
        return new Response('<html>403</html>', { status: 403 });
      }
      return new Response(productJson, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const obs = await new DigikalaApiAdapter().fetch({ source: SOURCE, target: TARGET });

    expect(obs.price_irr).toBe(33004000);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/product/v1/products/11801878/');
    vi.unstubAllGlobals();
  });

  it('falls back to the second endpoint when the first one fails', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(String(url));
      if (String(url).includes('/product/v1/products/')) {
        return new Response('<html>500</html>', { status: 500 });
      }
      return new Response(productJson, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const obs = await new DigikalaApiAdapter().fetch({ source: SOURCE, target: TARGET });

    expect(obs.price_irr).toBe(33004000);
    expect(calls).toHaveLength(2);
    vi.unstubAllGlobals();
  });
});

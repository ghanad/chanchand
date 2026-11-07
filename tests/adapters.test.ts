import { describe, it, expect } from 'vitest';
import { DigikalaApiAdapter } from '../src/lib/adapters/digikalaApi';
import { DigikalaWebAdapter } from '../src/lib/adapters/digikalaWeb';
import { GenericHtmlAdapter } from '../src/lib/adapters/genericHtml';
import { BrsapiMarketAdapter } from '../src/lib/adapters/brsapiMarket';
import { ServixMarketAdapter } from '../src/lib/adapters/servixMarket';
import { IranjibAdapter } from '../src/lib/adapters/iranjib';

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

  describe('IranjibAdapter', () => {
    const iranjibHtml = `
      <html>
        <body>
          <table dir="rtl" class="items_table persian">
            <tr class="catsection"><td colspan="5"><h2 id="ایران خودرو">ایران خودرو</h2></td></tr>
            <tr class="header">
              <th dir="rtl">نام خودرو</th>
              <th dir="rtl">قیمت بازار (تومان)</th>
              <th dir="rtl">قیمت کارخانه (تومان)</th>
              <th dir="rtl">تغییر</th>
              <th class="hidemobile"></th>
            </tr>
            <tr>
              <td class="entryrtl"><a href="https://www.iranjib.ir/shownews/1" target="_blank">وانت آریسان</a></td>
              <td><span class="lastprice">۲,۲۰۰,۰۰۰,۰۰۰</span></td>
              <td><span class="lastprice">۲,۰۲۶,۴۰۰,۰۰۰</span></td>
              <td><span class="change">-1%</span></td>
              <td class="thincol"><a href="#" class="downlink" data-target="16025">chart</a></td>
            </tr>
            <tr>
              <td class="entryrtl"><a href="https://www.iranjib.ir/shownews/2" target="_blank">دنا پلاس اتوماتیک</a></td>
              <td><span class="lastprice">۴,۵۲۷,۰۰۰,۰۰۰</span></td>
              <td><span class="lastprice">۲,۶۱۱,۰۰۰,۰۰۰</span></td>
              <td><span class="change">+2%</span></td>
              <td class="thincol"><a href="#" class="downlink" data-target="18079">chart</a></td>
            </tr>
            <tr>
              <td class="entryrtl"><a href="https://www.iranjib.ir/shownews/3" target="_blank">تارا اتوماتیک V4</a></td>
              <td><span class="lastprice">ناموجود</span></td>
              <td><span class="lastprice">توقف فروش</span></td>
              <td><span class="change">0</span></td>
              <td class="thincol"><a href="#" class="downlink" data-target="18081">chart</a></td>
            </tr>
            <tr class="catsection"><td colspan="5"><h2 id="سایپا">سایپا</h2></td></tr>
            <tr class="header">
              <th dir="rtl">نام خودرو</th>
              <th dir="rtl">قیمت بازار (تومان)</th>
              <th dir="rtl">قیمت کارخانه (تومان)</th>
              <th dir="rtl">تغییر</th>
              <th class="hidemobile"></th>
            </tr>
            <tr>
              <td class="entryrtl"><a href="https://www.iranjib.ir/shownews/4" target="_blank">شاهین اتوماتیک G</a></td>
              <td><span class="lastprice">۳,۴۲۵,۰۰۰,۰۰۰</span></td>
              <td><span class="lastprice">۱,۵۶۰,۷۷۶,۰۰۰</span></td>
              <td><span class="change">+1%</span></td>
              <td class="thincol"><a href="#" class="downlink" data-target="17955">chart</a></td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const sourceConfig = {
      adapter: 'iranjib',
      timeout_seconds: 15,
      rate_limit_seconds: 2,
      currency: 'TOMAN',
      price_multiplier: 10,
      headers: {},
      settings: {},
    };

    it('extracts market price in Toman and converts with price_multiplier 10', () => {
      const adapter = new IranjibAdapter();
      const obs = adapter.parse(
        iranjibHtml,
        sourceConfig,
        {
          product_key: 'arisan',
          source_key: 'iranjib',
          url: 'https://www.iranjib.ir/showgroup/45/قیمت-خودرو-تولید-داخل/',
          enabled: true,
          adapter_settings: {
            item_name: 'وانت آریسان',
          },
        }
      );

      expect(obs.title).toBe('وانت آریسان (ایران خودرو)');
      expect(obs.seller).toBe('ایران خودرو');
      // 2,200,000,000 Toman * 10 = 22,000,000,000 IRR
      expect(obs.price_irr).toBe(22000000000);
      expect(obs.availability).toBe('in_stock');
      expect(obs.raw_observation.market_price_raw).toBe('۲,۲۰۰,۰۰۰,۰۰۰');
      expect(obs.raw_observation.price_type).toBe('market');
    });

    it('finds vehicle across different companies (Saipa)', () => {
      const adapter = new IranjibAdapter();
      const obs = adapter.parse(
        iranjibHtml,
        sourceConfig,
        {
          product_key: 'shahin-g',
          source_key: 'iranjib',
          url: 'https://www.iranjib.ir/showgroup/45/قیمت-خودرو-تولید-داخل/',
          enabled: true,
          adapter_settings: {
            item_name: 'شاهین اتوماتیک G',
          },
        }
      );

      expect(obs.title).toBe('شاهین اتوماتیک G (سایپا)');
      expect(obs.seller).toBe('سایپا');
      // 3,425,000,000 Toman * 10 = 34,250,000,000 IRR
      expect(obs.price_irr).toBe(34250000000);
      expect(obs.availability).toBe('in_stock');
    });

    it('allows factory price if price_type is set to factory', () => {
      const adapter = new IranjibAdapter();
      const obs = adapter.parse(
        iranjibHtml,
        sourceConfig,
        {
          product_key: 'dena-plus',
          source_key: 'iranjib',
          url: 'https://www.iranjib.ir/showgroup/45/قیمت-خودرو-تولید-داخل/',
          enabled: true,
          adapter_settings: {
            item_name: 'دنا پلاس اتوماتیک',
            price_type: 'factory',
          },
        }
      );

      // 2,611,000,000 Toman * 10 = 26,110,000,000 IRR
      expect(obs.price_irr).toBe(26110000000);
      expect(obs.raw_observation.price_type).toBe('factory');
    });

    it('handles out of stock vehicle', () => {
      const adapter = new IranjibAdapter();
      const obs = adapter.parse(
        iranjibHtml,
        sourceConfig,
        {
          product_key: 'tara-v4',
          source_key: 'iranjib',
          url: 'https://www.iranjib.ir/showgroup/45/قیمت-خودرو-تولید-داخل/',
          enabled: true,
          adapter_settings: {
            item_name: 'تارا اتوماتیک V4',
          },
        }
      );

      expect(obs.price_irr).toBeNull();
      expect(obs.availability).toBe('out_of_stock');
    });

    it('matches by target URL hash if item_name is omitted', () => {
      const adapter = new IranjibAdapter();
      const obs = adapter.parse(
        iranjibHtml,
        sourceConfig,
        {
          product_key: 'arisan-hash',
          source_key: 'iranjib',
          url: 'https://www.iranjib.ir/showgroup/45/قیمت-خودرو-تولید-داخل/#وانت آریسان',
          enabled: true,
        }
      );

      expect(obs.title).toContain('وانت آریسان');
      expect(obs.price_irr).toBe(22000000000);
    });

    it('throws descriptive error if car is not found', () => {
      const adapter = new IranjibAdapter();
      expect(() => {
        adapter.parse(
          iranjibHtml,
          sourceConfig,
          {
            product_key: 'unknown',
            source_key: 'iranjib',
            url: 'https://www.iranjib.ir/showgroup/45/قیمت-خودرو-تولید-داخل/',
            enabled: true,
            adapter_settings: {
              item_name: 'ناموجود در جدول',
            },
          }
        );
      }).toThrow(/iranjib: could not find vehicle/);
    });
  });
});


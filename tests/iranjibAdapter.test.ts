import { describe, it, expect } from 'vitest';
import { IranjibAdapter } from '../src/lib/adapters/iranjib';

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

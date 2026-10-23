import * as cheerio from 'cheerio';
import { FetchContext, PriceAdapter } from './types';
import { PriceObservation, SourceConfig, TargetConfig } from '../types';
import { detectAvailability, parsePriceToIrr } from '../pricing';
import { validateSafeUrl } from '../security';

export class DigikalaWebAdapter implements PriceAdapter {
  name = 'digikala_web';

  async fetch(context: FetchContext): Promise<PriceObservation> {
    const urlCheck = validateSafeUrl(context.target.url);
    if (!urlCheck.valid) {
      throw new Error(`SSRF validation failed for DigikalaWeb target URL: ${urlCheck.reason}`);
    }

    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...context.source.headers,
    };

    const res = await fetch(context.target.url, {
      headers,
      signal: AbortSignal.timeout(context.source.timeout_seconds * 1000),
    });

    const html = await res.text();
    return this.parse(html, context.source, context.target, res.status);
  }

  parse(
    html: string,
    source: SourceConfig,
    target: TargetConfig,
    statusCode?: number
  ): PriceObservation {
    const $ = cheerio.load(html);

    const parsed = this.parseJsonLd($, source) || this.parseNextData($, source) || {};

    const metaOgTitle = $('meta[property="og:title"]').attr('content');
    const firstH1 = $('h1').first().text().trim();
    const title = parsed.title || metaOgTitle || firstH1 || null;

    const seller = parsed.seller || null;
    let priceIrr = parsed.price_irr ?? null;

    if (priceIrr === null) {
      const metaPrice = $('meta[property="product:price:amount"]').attr('content');
      priceIrr = parsePriceToIrr(metaPrice, source.price_multiplier);
    }

    const metaAvailability = $('meta[property="product:availability"]').attr('content');
    let availability = parsed.availability || detectAvailability(metaAvailability);
    if (availability === 'unknown' && priceIrr !== null) {
      availability = 'in_stock';
    }

    if (priceIrr === null && availability === 'unknown') {
      throw new Error('could not extract Digikala price data');
    }

    return {
      title,
      seller,
      price_irr: priceIrr,
      availability,
      raw_observation: {
        adapter: this.name,
        status_code: statusCode,
        parse_method: parsed.parse_method || 'html_meta',
        extracted: {
          title,
          seller,
          availability,
        },
      },
    };
  }

  private parseJsonLd($: cheerio.CheerioAPI, source: SourceConfig): Record<string, any> | null {
    const scripts = $('script[type="application/ld+json"]').toArray();
    for (const script of scripts) {
      const text = $(script).text().trim();
      if (!text) continue;
      try {
        const data = JSON.parse(text);
        const items = this.jsonLdItems(data);
        for (const item of items) {
          const itemType = item['@type'];
          const isProduct = Array.isArray(itemType) ? itemType.includes('Product') : itemType === 'Product';
          if (!isProduct) continue;

          let offers = item.offers || {};
          if (Array.isArray(offers)) {
            offers = offers[0] || {};
          }
          const availabilityText = String(offers.availability || '');

          return {
            parse_method: 'json_ld',
            title: item.name || null,
            seller: this.sellerName(offers.seller),
            price_irr: parsePriceToIrr(offers.price, source.price_multiplier),
            availability: detectAvailability(availabilityText),
          };
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  private parseNextData($: cheerio.CheerioAPI, source: SourceConfig): Record<string, any> | null {
    const script = $('script#__NEXT_DATA__').first();
    if (!script.length) return null;
    const text = script.text().trim();
    if (!text) return null;

    try {
      const data = JSON.parse(text);
      const price = this.firstNumericValue(
        data,
        ['selling_price', 'final_price', 'rrp_price', 'price'],
        source.price_multiplier
      );
      const title = this.firstStringValue(data, ['title_fa', 'title', 'name']);
      const seller = this.firstSeller(data);
      const availability = this.firstAvailability(data);

      return {
        parse_method: 'next_data',
        title,
        seller,
        price_irr: price,
        availability,
      };
    } catch {
      return null;
    }
  }

  private jsonLdItems(data: any): any[] {
    const items: any[] = [];
    if (data && typeof data === 'object') {
      if (Array.isArray(data['@graph'])) {
        for (const item of data['@graph']) {
          if (item && typeof item === 'object') {
            items.push(item);
          }
        }
      }
      items.push(data);
    } else if (Array.isArray(data)) {
      for (const item of data) {
        items.push(...this.jsonLdItems(item));
      }
    }
    return items;
  }

  private *walk(data: any): Generator<[string | null, any]> {
    if (data && typeof data === 'object') {
      if (Array.isArray(data)) {
        for (const val of data) {
          yield [null, val];
          yield* this.walk(val);
        }
      } else {
        for (const [key, val] of Object.entries(data)) {
          yield [key, val];
          yield* this.walk(val);
        }
      }
    }
  }

  private firstNumericValue(data: any, keys: string[], multiplier: number): number | null {
    for (const expectedKey of keys) {
      for (const [key, val] of this.walk(data)) {
        if (key !== expectedKey) continue;
        if (typeof val === 'number' && val > 0) {
          return Math.floor(val) * multiplier;
        }
        if (typeof val === 'string') {
          const parsed = parsePriceToIrr(val, multiplier);
          if (parsed !== null) return parsed;
        }
      }
    }
    return null;
  }

  private firstStringValue(data: any, keys: string[]): string | null {
    for (const expectedKey of keys) {
      for (const [key, val] of this.walk(data)) {
        if (key === expectedKey && typeof val === 'string' && val.trim()) {
          return val.trim();
        }
      }
    }
    return null;
  }

  private firstSeller(data: any): string | null {
    for (const [key, val] of this.walk(data)) {
      if (key === 'seller' || key === 'seller_title') {
        const seller = this.sellerName(val);
        if (seller) return seller;
      }
    }
    return null;
  }

  private firstAvailability(data: any): 'in_stock' | 'out_of_stock' | 'unknown' {
    for (const [key, val] of this.walk(data)) {
      if (key === 'availability' || key === 'status') {
        if (typeof val === 'string') {
          const lower = val.toLowerCase();
          if (['marketable', 'available', 'active', 'instock'].includes(lower)) {
            return 'in_stock';
          }
          if (['not_marketable', 'out_of_stock', 'unavailable', 'inactive', 'outofstock'].includes(lower)) {
            return 'out_of_stock';
          }
          const detected = detectAvailability(val);
          if (detected !== 'unknown') return detected;
        }
      }
    }
    return 'unknown';
  }

  private sellerName(value: any): string | null {
    if (typeof value === 'string') {
      return value.trim() || null;
    }
    if (value && typeof value === 'object') {
      for (const key of ['title', 'name', 'title_fa']) {
        if (typeof value[key] === 'string' && value[key].trim()) {
          return value[key].trim();
        }
      }
    }
    return null;
  }
}

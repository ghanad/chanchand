import * as cheerio from 'cheerio';
import { FetchContext, PriceAdapter } from './types';
import { PriceObservation, SourceConfig, TargetConfig } from '../types';
import { detectAvailability, parsePriceToIrr } from '../pricing';
import { validateSafeUrl } from '../security';

export class GenericHtmlAdapter implements PriceAdapter {
  name = 'generic_html';

  async fetch(context: FetchContext): Promise<PriceObservation> {
    const urlCheck = validateSafeUrl(context.target.url);
    if (!urlCheck.valid) {
      throw new Error(`SSRF validation failed for GenericHtml target URL: ${urlCheck.reason}`);
    }

    const headers: Record<string, string> = {
      'User-Agent': 'price-getter/0.1 (+https://example.local)',
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
    const settings = {
      ...source.settings,
      ...target.adapter_settings,
    };
    const selectors = settings.selectors || settings;
    const priceSelector = selectors.price || settings.price_selector;

    if (!priceSelector) {
      throw new Error('generic_html requires a price selector');
    }

    const $ = cheerio.load(html);

    const title = this.extract($, selectors.title || settings.title_selector);
    const seller = this.extract($, selectors.seller || settings.seller_selector);
    const priceText = this.extract($, priceSelector);
    const availabilityText = this.extract($, selectors.availability || settings.availability_selector);

    const priceIrr = parsePriceToIrr(priceText, source.price_multiplier);
    const availability = this.detectAvailabilityCustom(availabilityText, settings);

    if (priceIrr === null && availability === 'unknown') {
      throw new Error('could not extract a price from HTML');
    }

    return {
      title,
      seller,
      price_irr: priceIrr,
      availability,
      raw_observation: {
        adapter: this.name,
        status_code: statusCode,
        extracted: {
          title,
          seller,
          price_text: priceText,
          availability_text: availabilityText,
        },
      },
    };
  }

  private extract($: cheerio.CheerioAPI, selector: any): string | null {
    if (!selector) return null;

    let css = '';
    let attr: string | null = null;

    if (typeof selector === 'object' && selector !== null) {
      css = selector.css || '';
      attr = selector.attr || null;
    } else {
      const s = String(selector);
      if (s.includes('@')) {
        const parts = s.split('@');
        css = parts[0];
        attr = parts[1];
      } else {
        css = s;
      }
    }

    if (!css) return null;
    const node = $(css).first();
    if (!node.length) return null;

    if (attr) {
      const val = node.attr(attr);
      return val ? val.trim() : null;
    }

    const text = node.text().replace(/\s+/g, ' ').trim();
    return text || null;
  }

  private detectAvailabilityCustom(
    value: string | null,
    settings: Record<string, any>
  ): 'in_stock' | 'out_of_stock' | 'unknown' {
    if (value) {
      const lower = value.toLowerCase();
      const outTokens = settings.availability_out_of_stock_text || [];
      for (const tok of outTokens) {
        if (lower.includes(String(tok).toLowerCase())) {
          return 'out_of_stock';
        }
      }
      const inTokens = settings.availability_in_stock_text || [];
      for (const tok of inTokens) {
        if (lower.includes(String(tok).toLowerCase())) {
          return 'in_stock';
        }
      }
    }
    return detectAvailability(value);
  }
}

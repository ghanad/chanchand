import * as cheerio from 'cheerio';
import { FetchContext, PriceAdapter } from './types';
import { PriceObservation, SourceConfig, TargetConfig } from '../types';
import { detectAvailability, normalizeDigits, parsePriceToIrr } from '../pricing';
import { validateSafeUrl } from '../security';

const DEFAULT_CACHE_TTL_SECONDS = 60.0;

const IRANJIB_DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'fa-IR,fa;q=0.9,en-US;q=0.6,en;q=0.5',
};

const OUT_OF_STOCK_WORDS = [
  'ناموجود',
  'توقف فروش',
  'توقف تولید',
  'به زودی',
  '---',
  'موجود نیست',
  'اتمام موجودی',
  'عدم عرضه',
];

export interface IranjibItem {
  company: string;
  name: string;
  id: string | null;
  href: string | null;
  marketPrice: string;
  factoryPrice: string | null;
}

export class IranjibAdapter implements PriceAdapter {
  name = 'iranjib';
  private cache: Map<string, { timestamp: number; html: string; statusCode: number }> = new Map();

  async fetch(context: FetchContext): Promise<PriceObservation> {
    const urlCheck = validateSafeUrl(context.target.url);
    if (!urlCheck.valid) {
      throw new Error(`SSRF validation failed for Iranjib target URL: ${urlCheck.reason}`);
    }

    const { html, statusCode } = await this.fetchHtml(context);
    return this.parse(html, context.source, context.target, statusCode);
  }

  private async fetchHtml(
    context: FetchContext
  ): Promise<{ html: string; statusCode: number }> {
    const settings = {
      ...context.source.settings,
      ...context.target.adapter_settings,
    };

    const cacheTtlSeconds =
      typeof settings.cache_ttl_seconds === 'number' && settings.cache_ttl_seconds >= 0
        ? settings.cache_ttl_seconds
        : DEFAULT_CACHE_TTL_SECONDS;

    // Cache key based on URL without fragment
    const cleanUrl = context.target.url.split('#')[0];
    const now = Date.now();
    const cached = this.cache.get(cleanUrl);
    if (cached && now - cached.timestamp < cacheTtlSeconds * 1000) {
      return { html: cached.html, statusCode: cached.statusCode };
    }

    const headers: Record<string, string> = {
      ...IRANJIB_DEFAULT_HEADERS,
      ...context.source.headers,
    };

    const timeoutMs = (context.source.timeout_seconds || 15) * 1000;
    const res = await fetch(cleanUrl, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      throw new Error(`iranjib returned HTTP ${res.status}: ${res.statusText}`);
    }

    const html = await res.text();
    this.cache.set(cleanUrl, { timestamp: now, html, statusCode: res.status });
    return { html, statusCode: res.status };
  }

  parse(
    html: string,
    source: SourceConfig,
    target: TargetConfig,
    statusCode?: number
  ): PriceObservation {
    const items = this.extractItems(html);
    if (items.length === 0) {
      throw new Error('iranjib: no price tables or vehicle rows found on the page');
    }

    const settings = {
      ...source.settings,
      ...target.adapter_settings,
    };

    const priceType = String(settings.price_type || 'market').toLowerCase();
    const requestedId = this.clean(settings.item_id || settings.id);
    const requestedCompany = this.clean(settings.company);

    let requestedName = this.clean(
      settings.item_name || settings.name || settings.model || settings.car_name || target.product_title
    );

    // Fallback: extract from URL hash or query param if not set in settings
    if (!requestedName && !requestedId && target.url) {
      try {
        const parsedUrl = new URL(target.url);
        if (parsedUrl.hash) {
          const rawHash = decodeURIComponent(parsedUrl.hash.replace(/^#/, '')).trim();
          if (rawHash) {
            if (/^\d+$/.test(rawHash)) {
              // hash is numeric id
            } else if (rawHash.includes('/')) {
              // format company/carName
              const parts = rawHash.split('/');
              if (parts[1]) requestedName = parts[1].trim();
            } else {
              requestedName = rawHash;
            }
          }
        }
        if (!requestedName) {
          const itemParam = parsedUrl.searchParams.get('item') || parsedUrl.searchParams.get('car');
          if (itemParam) requestedName = itemParam.trim();
        }
      } catch {
        // ignore url parsing error
      }
    }

    // Secondary fallback: target.product_key
    if (!requestedName && !requestedId && target.product_key) {
      requestedName = target.product_key;
    }

    const matchedItem = this.findMatchingItem(items, {
      name: requestedName,
      id: requestedId,
      company: requestedCompany,
    });

    if (!matchedItem) {
      const criteria = [
        requestedCompany ? `company="${requestedCompany}"` : null,
        requestedName ? `name="${requestedName}"` : null,
        requestedId ? `id="${requestedId}"` : null,
      ]
        .filter(Boolean)
        .join(', ');

      const availableSample = items
        .slice(0, 10)
        .map((it) => `[${it.company}] ${it.name}`)
        .join(', ');

      throw new Error(
        `iranjib: could not find vehicle matching (${criteria || 'no criteria provided'}). Sample available vehicles: ${availableSample}`
      );
    }

    // Default is market price as requested ("ستون قیمت بازار برام مهم هست")
    const isFactory = priceType === 'factory' || priceType === 'agency';
    const rawPriceText = isFactory ? matchedItem.factoryPrice : matchedItem.marketPrice;

    const isOutOfStock = this.isExplicitlyOutOfStock(rawPriceText);

    let priceIrr: number | null = null;
    let availability: 'in_stock' | 'out_of_stock' | 'unknown' = 'unknown';

    if (isOutOfStock) {
      availability = 'out_of_stock';
      priceIrr = null;
    } else {
      priceIrr = parsePriceToIrr(rawPriceText, source.price_multiplier);
      if (priceIrr !== null && priceIrr > 0) {
        availability = 'in_stock';
      } else {
        const detected = detectAvailability(rawPriceText);
        availability = detected === 'in_stock' ? 'in_stock' : 'out_of_stock';
      }
    }

    const title = matchedItem.company
      ? `${matchedItem.name} (${matchedItem.company})`
      : matchedItem.name;

    return {
      title,
      seller: matchedItem.company || 'ایران جیب',
      price_irr: priceIrr,
      availability,
      raw_observation: {
        adapter: this.name,
        status_code: statusCode,
        url: target.url,
        company: matchedItem.company,
        item_name: matchedItem.name,
        item_id: matchedItem.id,
        price_type: isFactory ? 'factory' : 'market',
        market_price_raw: matchedItem.marketPrice,
        factory_price_raw: matchedItem.factoryPrice,
        price_multiplier: source.price_multiplier,
        currency: source.currency,
      },
    };
  }

  public extractItems(html: string): IranjibItem[] {
    const $ = cheerio.load(html);
    const items: IranjibItem[] = [];

    // Iranjib pages usually group items inside table.items_table
    const tables = $('table.items_table');
    const tableElements = tables.length > 0 ? tables.toArray() : $('table').toArray();

    for (const tbl of tableElements) {
      let currentCompany = 'سایر';
      let marketColIndex = 1;
      let factoryColIndex = 2;

      const rows = $(tbl).find('tr').toArray();
      for (const tr of rows) {
        const row = $(tr);

        // Section header for company (e.g., <tr class="catsection">...<h2>ایران خودرو</h2>...)
        const h2 = row.find('h2');
        if (h2.length > 0 || row.hasClass('catsection')) {
          const compText = h2.text().trim();
          if (compText) {
            currentCompany = compText;
          }
          continue;
        }

        // Table column headers
        if (row.hasClass('header') || row.find('th').length > 0) {
          row.find('th').each((colIdx, th) => {
            const heading = $(th).text().trim();
            if (heading.includes('بازار')) {
              marketColIndex = colIdx;
            } else if (heading.includes('کارخانه') || heading.includes('نمایندگی')) {
              factoryColIndex = colIdx;
            }
          });
          continue;
        }

        // Data rows
        const tds = row.find('td');
        if (tds.length >= 2) {
          const nameTd = $(tds[0]);
          const carName = nameTd.text().trim();
          if (!carName) continue;

          const downlink = row.find('.downlink, [data-target]');
          const itemId = downlink.attr('data-target') || null;
          const href = nameTd.find('a').attr('href') || null;

          const marketPrice = marketColIndex < tds.length ? $(tds[marketColIndex]).text().trim() : '';
          const factoryPrice = factoryColIndex < tds.length ? $(tds[factoryColIndex]).text().trim() : null;

          items.push({
            company: currentCompany,
            name: carName,
            id: itemId,
            href,
            marketPrice,
            factoryPrice,
          });
        }
      }
    }

    return items;
  }

  private findMatchingItem(
    items: IranjibItem[],
    criteria: { name?: string | null; id?: string | null; company?: string | null }
  ): IranjibItem | null {
    let pool = items;

    // Filter by company if requested
    if (criteria.company) {
      const compNorm = this.normalize(criteria.company);
      const filtered = pool.filter((it) => this.normalize(it.company).includes(compNorm));
      if (filtered.length > 0) {
        pool = filtered;
      }
    }

    // 1. Match by numeric id
    if (criteria.id) {
      const match = pool.find((it) => it.id === criteria.id);
      if (match) return match;
    }

    if (!criteria.name) {
      return pool[0] || null;
    }

    const targetNorm = this.normalize(criteria.name);

    // 2. Exact normalized name match
    const exactMatch = pool.find((it) => this.normalize(it.name) === targetNorm);
    if (exactMatch) return exactMatch;

    // 3. Normalized name starts with or ends with
    const boundaryMatch = pool.find((it) => {
      const nameNorm = this.normalize(it.name);
      return nameNorm.startsWith(targetNorm) || targetNorm.startsWith(nameNorm);
    });
    if (boundaryMatch) return boundaryMatch;

    // 4. Normalized substring match
    const subMatch = pool.find((it) => {
      const nameNorm = this.normalize(it.name);
      return nameNorm.includes(targetNorm) || targetNorm.includes(nameNorm);
    });
    if (subMatch) return subMatch;

    // 5. Word token match
    const targetWords = targetNorm.split(' ').filter((w) => w.length > 1);
    if (targetWords.length > 0) {
      let bestItem: IranjibItem | null = null;
      let maxMatches = 0;
      for (const item of pool) {
        const itemWords = new Set(this.normalize(item.name).split(' '));
        const matchCount = targetWords.filter((w) => itemWords.has(w)).length;
        if (matchCount > maxMatches) {
          maxMatches = matchCount;
          bestItem = item;
        }
      }
      if (bestItem && maxMatches >= Math.min(2, targetWords.length)) {
        return bestItem;
      }
    }

    return null;
  }

  private isExplicitlyOutOfStock(val?: string | null): boolean {
    if (!val) return true;
    const cleanVal = val.trim();
    if (!cleanVal || cleanVal === '---' || cleanVal === '-') return true;

    for (const token of OUT_OF_STOCK_WORDS) {
      if (cleanVal.includes(token)) return true;
    }
    return false;
  }

  private normalize(value: string): string {
    return normalizeDigits(value)
      .replace(/[\u200c\u200b\u200e\u200f]/g, ' ')
      .replace(/ي/g, 'ی')
      .replace(/ك/g, 'ک')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private clean(value: any): string | null {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    return s.length > 0 ? s : null;
  }
}

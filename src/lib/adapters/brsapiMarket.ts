import fs from 'fs';
import path from 'path';
import { FetchContext, PriceAdapter } from './types';
import { PriceObservation, SourceConfig, TargetConfig } from '../types';
import { parsePriceToIrr } from '../pricing';

const DEFAULT_API_KEY_ENV = 'brsapi_api';
const DEFAULT_CACHE_TTL_SECONDS = 30.0;

const BRSAPI_BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'fa-IR,fa;q=0.9,en-US;q=0.6,en;q=0.5',
};

export class BrsapiMarketAdapter implements PriceAdapter {
  name = 'brsapi_market';
  private cache: Map<string, { timestamp: number; payload: any; statusCode: number }> = new Map();

  async fetch(context: FetchContext): Promise<PriceObservation> {
    const settings = {
      ...context.source.settings,
      ...context.target.adapter_settings,
    };

    const apiKeyEnv = String(settings.api_key_env || DEFAULT_API_KEY_ENV);
    const apiKey = this.resolveApiKey(apiKeyEnv, settings.env_file);
    if (!apiKey) {
      throw new Error(`missing BRSAPI API key; set ${apiKeyEnv} in environment or .env`);
    }

    const apiUrl = this.urlWithApiKey(context.target.url, apiKey);
    const { payload, statusCode } = await this.fetchPayload(context, apiUrl, settings);

    return this.parseMarketPayload(payload, context.source, context.target, {
      apiUrl,
      statusCode,
    });
  }

  parseMarketPayload(
    payload: Record<string, any>,
    source: SourceConfig,
    target: TargetConfig,
    options: {
      apiUrl?: string;
      statusCode?: number;
    } = {}
  ): PriceObservation {
    const settings = {
      ...source.settings,
      ...target.adapter_settings,
    };
    const requestedSymbol = this.clean(settings.symbol);
    const requestedName = this.clean(settings.name || settings.market_name);

    if (!requestedSymbol && !requestedName) {
      throw new Error('brsapi_market requires target adapter_settings.symbol or name');
    }

    const { item, category } = this.findMarketItem(payload, requestedSymbol, requestedName);
    if (!item) {
      const requested = requestedSymbol || requestedName;
      throw new Error(`BRSAPI response did not include requested market item ${requested}`);
    }

    const priceIrr = parsePriceToIrr(item.price, source.price_multiplier);
    if (priceIrr === null) {
      const itemName = item.name || item.symbol || requestedName || requestedSymbol;
      throw new Error(`BRSAPI item ${itemName} did not include a usable price`);
    }

    const title = this.clean(item.name) || this.clean(item.name_en) || this.clean(item.symbol) || null;

    return {
      title,
      seller: 'BRS API',
      price_irr: priceIrr,
      availability: 'in_stock',
      raw_observation: {
        adapter: this.name,
        status_code: options.statusCode,
        parse_method: 'brsapi_market',
        api_url: options.apiUrl ? this.redactQueryParam(options.apiUrl, 'key') : null,
        category,
        symbol: item.symbol,
        name_en: item.name_en,
        name: item.name,
        unit: item.unit,
        date: item.date,
        time: item.time,
        time_unix: item.time_unix,
        change_value: item.change_value,
        change_percent: item.change_percent,
        extracted: {
          title,
          price: item.price,
          unit: item.unit,
        },
      },
    };
  }

  private async fetchPayload(
    context: FetchContext,
    apiUrl: string,
    settings: Record<string, any>
  ): Promise<{ payload: any; statusCode: number }> {
    const cacheTtlSeconds = Number(settings.cache_ttl_seconds ?? DEFAULT_CACHE_TTL_SECONDS);
    const now = Date.now();
    const cached = this.cache.get(apiUrl);

    if (cached && cacheTtlSeconds > 0 && now - cached.timestamp <= cacheTtlSeconds * 1000) {
      return { payload: cached.payload, statusCode: cached.statusCode };
    }

    const headers = {
      ...BRSAPI_BROWSER_HEADERS,
      ...context.source.headers,
    };

    const res = await fetch(apiUrl, {
      headers,
      signal: AbortSignal.timeout(context.source.timeout_seconds * 1000),
    });

    if (!res.ok) {
      throw new Error(`BRSAPI request failed with status ${res.status}`);
    }

    let payload: any;
    try {
      payload = await res.json();
    } catch {
      throw new Error('BRSAPI response was not valid JSON');
    }

    if (!payload || typeof payload !== 'object') {
      throw new Error('BRSAPI response was not a JSON object');
    }

    this.cache.set(apiUrl, { timestamp: now, payload, statusCode: res.status });
    return { payload, statusCode: res.status };
  }

  private findMarketItem(
    payload: Record<string, any>,
    symbol?: string | null,
    name?: string | null
  ): { item: any | null; category: string | null } {
    for (const category of ['gold', 'currency']) {
      const values = payload[category];
      if (!Array.isArray(values)) continue;
      for (const item of values) {
        if (!item || typeof item !== 'object') continue;
        if (symbol && this.clean(item.symbol) === symbol) {
          return { item, category };
        }
        if (name && this.clean(item.name) === name) {
          return { item, category };
        }
      }
    }
    return { item: null, category: null };
  }

  private resolveApiKey(envName: string, envFile?: string): string | null {
    if (process.env[envName]) {
      return process.env[envName]!.trim();
    }
    const envFilePath = envFile
      ? path.isAbsolute(envFile)
        ? envFile
        : path.resolve(process.cwd(), envFile)
      : path.resolve(process.cwd(), '.env');

    if (!fs.existsSync(envFilePath)) return null;

    try {
      const content = fs.readFileSync(envFilePath, 'utf-8');
      for (const line of content.split('\n')) {
        let trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        if (trimmed.startsWith('export ')) {
          trimmed = trimmed.slice('export '.length).trim();
        }
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const k = trimmed.slice(0, eqIdx).trim();
          let v = trimmed.slice(eqIdx + 1).trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          if (k === envName) return v;
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  private urlWithApiKey(urlStr: string, apiKey: string): string {
    const url = new URL(urlStr);
    url.searchParams.set('key', apiKey);
    return url.toString();
  }

  private redactQueryParam(urlStr: string, param: string): string {
    try {
      const url = new URL(urlStr);
      if (url.searchParams.has(param)) {
        url.searchParams.set(param, '<redacted>');
      }
      return url.toString();
    } catch {
      return urlStr;
    }
  }

  private clean(val: any): string | null {
    if (typeof val !== 'string') return null;
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}

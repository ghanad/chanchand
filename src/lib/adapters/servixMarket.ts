import fs from 'fs';
import path from 'path';
import { FetchContext, PriceAdapter } from './types';
import { PriceObservation, SourceConfig, TargetConfig } from '../types';
import { parsePriceToIrr } from '../pricing';
import { validateSafeUrl } from '../security';

const DEFAULT_API_KEY_ENV = 'SERVIX_API_KEY';
const ALLOWED_API_KEY_ENVS = new Set(['SERVIX_API_KEY', 'servix_api_key', 'SERVIX_KEY']);
const DEFAULT_CACHE_TTL_SECONDS = 300.0;

const SERVIX_DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': 'price-getter/0.1 (+https://github.com/price-getter)',
  Accept: 'application/json',
};

export class ServixMarketAdapter implements PriceAdapter {
  name = 'servix_market';
  private cache: Map<string, { timestamp: number; payload: any; statusCode: number }> = new Map();

  async fetch(context: FetchContext): Promise<PriceObservation> {
    const urlCheck = validateSafeUrl(context.target.url);
    if (!urlCheck.valid) {
      throw new Error(`SSRF validation failed for Servix target URL: ${urlCheck.reason}`);
    }

    const settings = {
      ...context.source.settings,
      ...context.target.adapter_settings,
    };

    const requestedEnv = settings.api_key_env ? String(settings.api_key_env).trim() : DEFAULT_API_KEY_ENV;
    if (!ALLOWED_API_KEY_ENVS.has(requestedEnv)) {
      throw new Error(
        `Disallowed API key environment variable "${requestedEnv}". Allowed variables: ${Array.from(ALLOWED_API_KEY_ENVS).join(', ')}`
      );
    }

    const apiKey = this.resolveApiKey(requestedEnv);
    if (!apiKey) {
      throw new Error(`missing Servix API key; set ${requestedEnv} in environment or .env`);
    }

    const apiUrl = context.target.url;
    const { payload, statusCode } = await this.fetchPayload(context, apiUrl, apiKey, settings);

    return this.parseMarketPayload(payload, context.source, context.target, {
      apiUrl,
      statusCode,
    });
  }

  parseMarketPayload(
    payload: any,
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
    const requestedSymbol = this.clean(settings.symbol || settings.code);
    const requestedName = this.clean(settings.name || settings.market_name);

    if (!requestedSymbol && !requestedName) {
      throw new Error('servix_market requires target adapter_settings.symbol or name');
    }

    const item = this.findMarketItem(payload, requestedSymbol, requestedName);
    if (!item) {
      const requested = requestedSymbol || requestedName;
      throw new Error(`Servix response did not include requested market item ${requested}`);
    }

    const rawPrice = item.value ?? item.midPrice ?? item.sellPrice ?? item.buyPrice ?? item.price;
    const priceIrr = parsePriceToIrr(rawPrice, source.price_multiplier);
    if (priceIrr === null) {
      const itemName = item.labelFa || item.labelEn || item.name || item.code || requestedName || requestedSymbol;
      throw new Error(`Servix item ${itemName} did not include a usable price`);
    }

    const title = this.clean(item.labelFa) || this.clean(item.labelEn) || this.clean(item.name) || this.clean(item.code) || null;

    return {
      title,
      seller: 'Servix',
      price_irr: priceIrr,
      availability: 'in_stock',
      raw_observation: {
        adapter: this.name,
        status_code: options.statusCode,
        parse_method: 'servix_market',
        api_url: options.apiUrl || null,
        code: item.code,
        label_fa: item.labelFa,
        label_en: item.labelEn,
        quote_unit: item.quoteUnit,
        business_time: item.businessTime,
        value: item.value,
        buy_price: item.buyPrice,
        sell_price: item.sellPrice,
        mid_price: item.midPrice,
        extracted: {
          title,
          price: rawPrice,
          unit: item.quoteUnit,
        },
      },
    };
  }

  private async fetchPayload(
    context: FetchContext,
    apiUrl: string,
    apiKey: string,
    settings: Record<string, any>
  ): Promise<{ payload: any; statusCode: number }> {
    const cacheTtlSeconds = Number(settings.cache_ttl_seconds ?? DEFAULT_CACHE_TTL_SECONDS);
    const now = Date.now();
    const cached = this.cache.get(apiUrl);

    if (cached && cacheTtlSeconds > 0 && now - cached.timestamp <= cacheTtlSeconds * 1000) {
      return { payload: cached.payload, statusCode: cached.statusCode };
    }

    const headers = {
      ...SERVIX_DEFAULT_HEADERS,
      'X-API-Key': apiKey,
      ...context.source.headers,
    };

    const res = await fetch(apiUrl, {
      headers,
      signal: AbortSignal.timeout(context.source.timeout_seconds * 1000),
    });

    if (!res.ok) {
      throw new Error(`Servix request failed with status ${res.status}`);
    }

    let payload: any;
    try {
      payload = await res.json();
    } catch {
      throw new Error('Servix response was not valid JSON');
    }

    if (!payload || (typeof payload !== 'object' && !Array.isArray(payload))) {
      throw new Error('Servix response was not a JSON object or array');
    }

    this.cache.set(apiUrl, { timestamp: now, payload, statusCode: res.status });
    return { payload, statusCode: res.status };
  }

  private findMarketItem(
    payload: any,
    symbol?: string | null,
    name?: string | null
  ): any | null {
    if (Array.isArray(payload)) {
      for (const item of payload) {
        if (!item || typeof item !== 'object') continue;
        if (symbol) {
          const symUpper = symbol.toUpperCase();
          if (
            (item.code && String(item.code).toUpperCase() === symUpper) ||
            (item.name && String(item.name).toUpperCase() === symUpper) ||
            (item.slug && String(item.slug).toUpperCase() === symUpper)
          ) {
            return item;
          }
        }
        if (name) {
          if (
            (item.labelFa && this.clean(item.labelFa) === name) ||
            (item.labelEn && this.clean(item.labelEn) === name) ||
            (item.name && this.clean(item.name) === name)
          ) {
            return item;
          }
        }
      }
      return null;
    }

    if (payload && typeof payload === 'object') {
      if (symbol) {
        const symUpper = symbol.toUpperCase();
        if (
          (payload.code && String(payload.code).toUpperCase() === symUpper) ||
          (payload.name && String(payload.name).toUpperCase() === symUpper) ||
          (payload.slug && String(payload.slug).toUpperCase() === symUpper)
        ) {
          return payload;
        }
      }
      // If payload is a single item matching the endpoint
      if (payload.code || payload.value !== undefined || payload.midPrice !== undefined) {
        return payload;
      }
    }

    return null;
  }

  private resolveApiKey(envName: string): string | null {
    if (process.env[envName]) {
      return process.env[envName]!.trim();
    }
    const envFilePath = path.resolve(process.cwd(), '.env');

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

  private clean(val: any): string | null {
    if (typeof val !== 'string') return null;
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}

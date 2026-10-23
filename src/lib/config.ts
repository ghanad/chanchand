import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { z } from 'zod';
import { AppConfig, SourceConfig, ProductConfig, TargetConfig } from './types';

const KEY_RE = /^[A-Za-z0-9_.-]+$/;

export const SourceConfigSchema = z.object({
  adapter: z.enum(['generic_html', 'digikala', 'digikala_api', 'digikala_web', 'brsapi_market']),
  timeout_seconds: z.number().positive().default(15.0),
  rate_limit_seconds: z.number().min(0).default(2.0),
  currency: z.string().trim().min(1).default('IRR').transform((v) => v.toUpperCase()),
  price_multiplier: z.number().int().positive().default(1),
  headers: z.record(z.string()).default({}),
  settings: z.record(z.any()).default({}),
});

export const ProductConfigSchema = z.object({
  title: z.string().trim().min(1, 'title cannot be empty'),
});

export const TargetConfigSchema = z.object({
  product_key: z.string().regex(KEY_RE, 'keys may contain only letters, numbers, dots, underscores, and dashes'),
  source_key: z.string().regex(KEY_RE, 'keys may contain only letters, numbers, dots, underscores, and dashes'),
  url: z.string().trim().refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
    message: 'url must be an http(s) URL',
  }),
  enabled: z.boolean().default(true),
  adapter_settings: z.record(z.any()).default({}),
});

export const AppConfigSchema = z
  .object({
    sources: z.record(SourceConfigSchema),
    products: z.record(ProductConfigSchema),
    targets: z.array(TargetConfigSchema),
  })
  .superRefine((data, ctx) => {
    for (const key of Object.keys(data.sources)) {
      if (!KEY_RE.test(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid source key "${key}": keys may contain only letters, numbers, dots, underscores, and dashes`,
        });
      }
    }
    for (const key of Object.keys(data.products)) {
      if (!KEY_RE.test(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid product key "${key}": keys may contain only letters, numbers, dots, underscores, and dashes`,
        });
      }
    }

    if (Object.keys(data.sources).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'at least one source is required',
      });
    }
    if (Object.keys(data.products).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'at least one product is required',
      });
    }

    const productKeys = new Set(Object.keys(data.products));
    const sourceKeys = new Set(Object.keys(data.sources));

    const missingProducts = new Set<string>();
    const missingSources = new Set<string>();

    for (const target of data.targets) {
      if (!productKeys.has(target.product_key)) {
        missingProducts.add(target.product_key);
      }
      if (!sourceKeys.has(target.source_key)) {
        missingSources.add(target.source_key);
      }
    }

    if (missingProducts.size > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `targets reference unknown products: ${Array.from(missingProducts).sort().join(', ')}`,
      });
    }
    if (missingSources.size > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `targets reference unknown sources: ${Array.from(missingSources).sort().join(', ')}`,
      });
    }
  });

export function resolveConfigPath(customPath?: string): string {
  const p = customPath || process.env.PRICE_GETTER_CONFIG || 'config/example.yml';
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

export function loadConfig(configPath?: string): AppConfig {
  const resolved = resolveConfigPath(configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`config file not found: ${resolved}`);
  }
  const content = fs.readFileSync(resolved, 'utf-8');
  const parsedYaml = YAML.parse(content);
  if (!parsedYaml || typeof parsedYaml !== 'object') {
    throw new Error('config file must contain a YAML mapping');
  }
  const result = AppConfigSchema.safeParse(parsedYaml);
  if (!result.success) {
    const errorDetails = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new Error(`Config validation failed: ${errorDetails}`);
  }
  return result.data as AppConfig;
}

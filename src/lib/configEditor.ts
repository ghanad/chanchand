import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { loadConfig, resolveConfigPath } from './config';

export interface ConfigEditResult {
  product_key: string;
  backup_path: string;
}

export function makeProductKey(title: string, existing: Record<string, any>): string {
  let base = title.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '-');
  base = base.replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  if (!base) {
    base = 'product';
  }

  let candidate = base;
  let index = 2;
  while (candidate in existing) {
    candidate = `${base}-${index}`;
    index++;
  }
  return candidate;
}

function selectSource(sources: Record<string, any>, sourceKey?: string | null): string {
  if (sourceKey) {
    if (!(sourceKey in sources)) {
      throw new Error(`unknown source: ${sourceKey}`);
    }
    return sourceKey;
  }
  if ('digikala_api' in sources) {
    return 'digikala_api';
  }
  const firstKey = Object.keys(sources)[0];
  if (!firstKey) {
    throw new Error('config must define at least one source');
  }
  return firstKey;
}

function createBackup(configPath: string): string {
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '');
  const parsed = path.parse(configPath);
  const backupPath = path.join(parsed.dir, `${parsed.base}.${timestamp}.bak`);
  fs.copyFileSync(configPath, backupPath);
  return backupPath;
}

function loadRaw(configPath: string): { doc: YAML.Document; raw: any } {
  const resolved = resolveConfigPath(configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`config file not found: ${resolved}`);
  }
  const content = fs.readFileSync(resolved, 'utf-8');
  const doc = YAML.parseDocument(content);
  const raw = doc.toJS();
  if (!raw || typeof raw !== 'object') {
    throw new Error('config must be a YAML mapping');
  }
  return { doc, raw };
}

function writeValidated(configPath: string, raw: any): string {
  const resolved = resolveConfigPath(configPath);
  const original = fs.readFileSync(resolved, 'utf-8');
  const backupPath = createBackup(resolved);

  const updatedYaml = YAML.stringify(raw, { indent: 2 });
  fs.writeFileSync(resolved, updatedYaml, 'utf-8');

  try {
    loadConfig(resolved);
  } catch (err: any) {
    fs.writeFileSync(resolved, original, 'utf-8');
    throw new Error(`Invalid configuration produced: ${err.message}`);
  }

  return backupPath;
}

export function addProductTarget(
  configPath: string,
  options: { title: string; url: string; source_key?: string | null }
): ConfigEditResult {
  const { raw } = loadRaw(configPath);
  const sources = raw.sources ?? {};
  const products = raw.products ?? {};
  const targets = raw.targets ?? [];

  const cleanTitle = options.title.trim();
  if (!cleanTitle) {
    throw new Error('title cannot be empty');
  }
  if (Object.keys(sources).length === 0) {
    throw new Error('config must define at least one source');
  }

  const selectedSource = selectSource(sources, options.source_key);
  const productKey = makeProductKey(cleanTitle, products);

  products[productKey] = { title: cleanTitle };
  raw.products = products;

  targets.push({
    product_key: productKey,
    source_key: selectedSource,
    url: options.url.trim(),
    enabled: true,
  });
  raw.targets = targets;

  const backupPath = writeValidated(configPath, raw);
  return { product_key: productKey, backup_path: backupPath };
}

export function updateProductTarget(
  configPath: string,
  productKey: string,
  options: { title: string; url: string; source_key?: string | null }
): ConfigEditResult {
  const { raw } = loadRaw(configPath);
  const sources = raw.sources ?? {};
  const products = raw.products ?? {};
  const targets = raw.targets ?? [];

  if (!(productKey in products)) {
    throw new Error(`unknown product: ${productKey}`);
  }

  const cleanTitle = options.title.trim();
  const cleanUrl = options.url.trim();
  if (!cleanTitle) {
    throw new Error('title cannot be empty');
  }

  const selectedSource = selectSource(sources, options.source_key);
  products[productKey] = { title: cleanTitle };
  raw.products = products;

  let matched = false;
  for (const target of targets) {
    if (target && typeof target === 'object' && target.product_key === productKey) {
      target.source_key = selectedSource;
      target.url = cleanUrl;
      matched = true;
      break;
    }
  }

  if (!matched) {
    throw new Error(`product has no targets: ${productKey}`);
  }

  raw.targets = targets;
  const backupPath = writeValidated(configPath, raw);
  return { product_key: productKey, backup_path: backupPath };
}

export function deleteProduct(configPath: string, productKey: string): ConfigEditResult {
  const { raw } = loadRaw(configPath);
  const products = raw.products ?? {};
  const targets = raw.targets ?? [];

  if (!(productKey in products)) {
    throw new Error(`unknown product: ${productKey}`);
  }
  if (Object.keys(products).length <= 1) {
    throw new Error('cannot delete the last product');
  }

  delete products[productKey];
  raw.products = products;
  raw.targets = targets.filter((t: any) => t && t.product_key !== productKey);

  const backupPath = writeValidated(configPath, raw);
  return { product_key: productKey, backup_path: backupPath };
}

export function disableProduct(configPath: string, productKey: string): ConfigEditResult {
  const { raw } = loadRaw(configPath);
  const products = raw.products ?? {};
  const targets = raw.targets ?? [];

  if (!(productKey in products)) {
    throw new Error(`unknown product: ${productKey}`);
  }

  let changed = false;
  for (const target of targets) {
    if (target && typeof target === 'object' && target.product_key === productKey && target.enabled !== false) {
      target.enabled = false;
      changed = true;
    }
  }

  if (!changed) {
    throw new Error(`product has no enabled targets: ${productKey}`);
  }

  raw.targets = targets;
  const backupPath = writeValidated(configPath, raw);
  return { product_key: productKey, backup_path: backupPath };
}

export function enableProduct(configPath: string, productKey: string): ConfigEditResult {
  const { raw } = loadRaw(configPath);
  const products = raw.products ?? {};
  const targets = raw.targets ?? [];

  if (!(productKey in products)) {
    throw new Error(`unknown product: ${productKey}`);
  }

  let matched = false;
  let changed = false;
  for (const target of targets) {
    if (target && typeof target === 'object' && target.product_key === productKey) {
      matched = true;
      if (target.enabled === false) {
        target.enabled = true;
        changed = true;
      }
    }
  }

  if (!matched) {
    throw new Error(`product has no targets: ${productKey}`);
  }
  if (!changed) {
    throw new Error(`product has no disabled targets: ${productKey}`);
  }

  raw.targets = targets;
  const backupPath = writeValidated(configPath, raw);
  return { product_key: productKey, backup_path: backupPath };
}

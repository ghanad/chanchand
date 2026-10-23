import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/lib/config';

describe('config module', () => {
  it('loads valid example.yml config', () => {
    const config = loadConfig('config/example.yml');
    expect(config.sources).toBeDefined();
    expect(config.products).toBeDefined();
    expect(config.targets).toBeDefined();
    expect(config.sources.digikala_api.adapter).toBe('digikala_api');
    expect(config.products['smart-air-purifier-6']).toBeDefined();
  });

  it('fails on missing file', () => {
    expect(() => loadConfig('nonexistent.yml')).toThrow(/not found/);
  });
});

import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/lib/config';
import fs from 'fs';

describe('config module', () => {
  it('loads valid YAML config if file exists', () => {
    const tmp = 'test_config.yml';
    fs.writeFileSync(
      tmp,
      'sources:\n  demo:\n    adapter: generic_html\n'
    );
    try {
      const config = loadConfig(tmp);
      expect(config.sources.demo.adapter).toBe('generic_html');
      expect(config.products).toEqual({});
      expect(config.targets).toEqual([]);
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  });

  it('fails on missing file', () => {
    expect(() => loadConfig('nonexistent.yml')).toThrow(/not found/);
  });
});

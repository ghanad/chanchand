import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sanitizeInternalRedirect, validateSafeUrl, MemoryRateLimiter } from '../src/lib/security';
import { BrsapiMarketAdapter } from '../src/lib/adapters/brsapiMarket';
import { GenericHtmlAdapter } from '../src/lib/adapters/genericHtml';
import { DigikalaWebAdapter } from '../src/lib/adapters/digikalaWeb';
import { signAuthToken } from '../src/lib/jwt';

describe('Security Utilities & Hardening', () => {
  describe('sanitizeInternalRedirect', () => {
    it('allows valid internal relative paths', () => {
      expect(sanitizeInternalRedirect('/')).toBe('/');
      expect(sanitizeInternalRedirect('/admin')).toBe('/admin');
      expect(sanitizeInternalRedirect('/products?sort=desc#top')).toBe('/products?sort=desc#top');
      expect(sanitizeInternalRedirect('/settings/users/2')).toBe('/settings/users/2');
    });

    it('rejects external URLs and returns fallback', () => {
      expect(sanitizeInternalRedirect('https://evil.com')).toBe('/');
      expect(sanitizeInternalRedirect('http://attacker.com/steal')).toBe('/');
      expect(sanitizeInternalRedirect('//evil.com')).toBe('/');
      expect(sanitizeInternalRedirect('//evil.com/path', '/admin')).toBe('/admin');
      expect(sanitizeInternalRedirect('/\\evil.com')).toBe('/');
    });

    it('rejects dangerous protocols (javascript, data, vbscript)', () => {
      expect(sanitizeInternalRedirect('javascript:alert(1)')).toBe('/');
      expect(sanitizeInternalRedirect('data:text/html,<script>alert(1)</script>')).toBe('/');
    });

    it('handles empty, null, and non-string inputs safely', () => {
      expect(sanitizeInternalRedirect(null)).toBe('/');
      expect(sanitizeInternalRedirect(undefined, '/admin')).toBe('/admin');
      expect(sanitizeInternalRedirect('')).toBe('/');
      expect(sanitizeInternalRedirect('   ')).toBe('/');
    });
  });

  describe('validateSafeUrl (SSRF Prevention)', () => {
    it('accepts safe public http and https URLs', () => {
      expect(validateSafeUrl('https://api.digikala.com/v1/products/123').valid).toBe(true);
      expect(validateSafeUrl('https://example.com/products').valid).toBe(true);
      expect(validateSafeUrl('http://public-domain.ir/item/5').valid).toBe(true);
    });

    it('blocks localhost, loopback, and local domain targets', () => {
      expect(validateSafeUrl('http://localhost:8000/api').valid).toBe(false);
      expect(validateSafeUrl('http://sub.localhost').valid).toBe(false);
      expect(validateSafeUrl('http://127.0.0.1:3000').valid).toBe(false);
      expect(validateSafeUrl('http://0.0.0.0:80').valid).toBe(false);
      expect(validateSafeUrl('http://[::1]:8080').valid).toBe(false);
    });

    it('blocks cloud metadata endpoints', () => {
      expect(validateSafeUrl('http://169.254.169.254/latest/meta-data/').valid).toBe(false);
      expect(validateSafeUrl('http://metadata.google.internal/computeMetadata/v1/').valid).toBe(false);
    });

    it('blocks RFC1918 and carrier-grade private IP addresses', () => {
      expect(validateSafeUrl('http://10.0.0.1/admin').valid).toBe(false);
      expect(validateSafeUrl('http://172.16.0.10:8080').valid).toBe(false);
      expect(validateSafeUrl('http://172.31.255.255').valid).toBe(false);
      expect(validateSafeUrl('http://192.168.1.1').valid).toBe(false);
      expect(validateSafeUrl('http://100.64.0.1').valid).toBe(false);
    });

    it('rejects non-http protocols (file, gopher, ftp)', () => {
      expect(validateSafeUrl('file:///etc/passwd').valid).toBe(false);
      expect(validateSafeUrl('gopher://127.0.0.1').valid).toBe(false);
      expect(validateSafeUrl('ftp://example.com').valid).toBe(false);
    });
  });

  describe('MemoryRateLimiter', () => {
    it('limits attempts after threshold and allows recovery', () => {
      const limiter = new MemoryRateLimiter(5000, 3);
      const testIp = '192.0.2.1';

      expect(limiter.isRateLimited(testIp)).toBe(false);

      limiter.recordFailure(testIp);
      limiter.recordFailure(testIp);
      expect(limiter.isRateLimited(testIp)).toBe(false);

      limiter.recordFailure(testIp);
      expect(limiter.isRateLimited(testIp)).toBe(true);

      // Successful login resets counter
      limiter.recordSuccess(testIp);
      expect(limiter.isRateLimited(testIp)).toBe(false);
    });
  });

  describe('Adapter Security Checks', () => {
    it('BrsapiMarketAdapter rejects SSRF targets', async () => {
      const adapter = new BrsapiMarketAdapter();
      await expect(
        adapter.fetch({
          source: {
            adapter: 'brsapi_market',
            timeout_seconds: 5,
            rate_limit_seconds: 0,
            currency: 'IRR',
            price_multiplier: 1,
            headers: {},
            settings: {},
          },
          target: {
            product_key: 'test',
            source_key: 'test',
            url: 'http://127.0.0.1:8000/internal',
            enabled: true,
          },
        })
      ).rejects.toThrow(/SSRF validation failed/);
    });

    it('BrsapiMarketAdapter rejects unauthorized api_key_env names', async () => {
      const adapter = new BrsapiMarketAdapter();
      await expect(
        adapter.fetch({
          source: {
            adapter: 'brsapi_market',
            timeout_seconds: 5,
            rate_limit_seconds: 0,
            currency: 'IRR',
            price_multiplier: 1,
            headers: {},
            settings: {},
          },
          target: {
            product_key: 'test',
            source_key: 'test',
            url: 'https://example.com/api',
            enabled: true,
            adapter_settings: {
              api_key_env: 'JWT_SECRET',
            },
          },
        })
      ).rejects.toThrow(/Disallowed API key environment variable/);
    });

    it('GenericHtmlAdapter rejects SSRF targets', async () => {
      const adapter = new GenericHtmlAdapter();
      await expect(
        adapter.fetch({
          source: {
            adapter: 'generic_html',
            timeout_seconds: 5,
            rate_limit_seconds: 0,
            currency: 'IRR',
            price_multiplier: 1,
            headers: {},
            settings: {},
          },
          target: {
            product_key: 'test',
            source_key: 'test',
            url: 'http://169.254.169.254/latest/meta-data/',
            enabled: true,
          },
        })
      ).rejects.toThrow(/SSRF validation failed/);
    });

    it('DigikalaWebAdapter rejects SSRF targets', async () => {
      const adapter = new DigikalaWebAdapter();
      await expect(
        adapter.fetch({
          source: {
            adapter: 'digikala_web',
            timeout_seconds: 5,
            rate_limit_seconds: 0,
            currency: 'IRR',
            price_multiplier: 1,
            headers: {},
            settings: {},
          },
          target: {
            product_key: 'test',
            source_key: 'test',
            url: 'http://localhost:3000/product/123',
            enabled: true,
          },
        })
      ).rejects.toThrow(/SSRF validation failed/);
    });
  });

  describe('JWT Security In Production', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('throws error when JWT_SECRET is missing in production mode', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;

      await expect(
        signAuthToken({ id: 1, username: 'admin', role: 'admin' })
      ).rejects.toThrow(/JWT_SECRET environment variable is required in production/);
    });

    it('throws error when JWT_SECRET is shorter than 32 chars in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'short_secret';

      await expect(
        signAuthToken({ id: 1, username: 'admin', role: 'admin' })
      ).rejects.toThrow(/must be at least 32 characters/);
    });
  });
});

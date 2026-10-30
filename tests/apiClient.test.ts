import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestJson } from '../src/lib/api-client';

describe('requestJson client utility', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('extracts payload.error when response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: 'نام کاربری یا کلمه عبور نادرست است.' }),
    } as any);

    await expect(requestJson('/api/test')).rejects.toThrow('نام کاربری یا کلمه عبور نادرست است.');
  });

  it('falls back to localized message for 401 if payload is empty', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({}),
    } as any);

    await expect(requestJson('/api/test')).rejects.toThrow('نام کاربری یا کلمه عبور نادرست است.');
  });

  it('extracts detail or message if error property is absent', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ detail: 'خطای اعتبارسنجی' }),
    } as any);

    await expect(requestJson('/api/test')).rejects.toThrow('خطای اعتبارسنجی');
  });

  it('returns parsed payload on successful response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: 123 }),
    } as any);

    const result = await requestJson<{ success: boolean; data: number }>('/api/test');
    expect(result).toEqual({ success: true, data: 123 });
  });
});

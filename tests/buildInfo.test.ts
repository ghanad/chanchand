import { describe, it, expect } from 'vitest';
import {
  resolveBuildInfo,
  formatBuildInfoCopyText,
} from '../src/lib/build-info';

describe('build-info module', () => {
  describe('resolveBuildInfo', () => {
    it('returns null when no version is provided', () => {
      expect(resolveBuildInfo({})).toBeNull();
      expect(resolveBuildInfo({ version: '' })).toBeNull();
      expect(resolveBuildInfo({ version: '   ' })).toBeNull();
      expect(resolveBuildInfo({ version: null })).toBeNull();
    });

    it('strips a leading v prefix from the version', () => {
      expect(resolveBuildInfo({ version: 'v1.6.1' })?.version).toBe('1.6.1');
      expect(resolveBuildInfo({ version: 'V2.0.0' })?.version).toBe('2.0.0');
    });

    it('shortens a full git sha to seven characters', () => {
      const info = resolveBuildInfo({
        version: '1.6.1',
        commit: '622248a1b2c3d4e5f60718293a4b5c6d7e8f9012',
      });
      expect(info?.commit).toBe('622248a');
    });

    it('keeps an already-short commit untouched', () => {
      expect(
        resolveBuildInfo({ version: '1.6.1', commit: '622248a' })?.commit
      ).toBe('622248a');
    });

    it('keeps non-hex commit labels usable for local builds', () => {
      expect(
        resolveBuildInfo({ version: '1.6.1', commit: 'local-dirty' })?.commit
      ).toBe('local-dirty');
    });

    it('drops empty commit and builtAt values', () => {
      const info = resolveBuildInfo({
        version: '1.6.1',
        commit: '',
        builtAt: '  ',
      });
      expect(info).toEqual({
        version: '1.6.1',
        commit: null,
        builtAt: null,
      });
    });

    it('keeps an ISO build timestamp', () => {
      const builtAt = '2026-11-14T18:30:00.000Z';
      expect(
        resolveBuildInfo({ version: '1.6.1', builtAt })?.builtAt
      ).toBe(builtAt);
    });
  });

  describe('formatBuildInfoCopyText', () => {
    it('omits missing fields', () => {
      expect(
        formatBuildInfoCopyText({
          version: '1.6.1',
          commit: null,
          builtAt: null,
        })
      ).toBe('chanchand v1.6.1');
    });

    it('includes commit and build time when present', () => {
      expect(
        formatBuildInfoCopyText({
          version: '1.6.1',
          commit: '622248a',
          builtAt: '2026-11-14T18:30:00.000Z',
        })
      ).toBe('chanchand v1.6.1 (622248a) built 2026-11-14T18:30:00.000Z');
    });
  });
});

describe('BuildVersionBadge', () => {
  it('renders nothing when no build info is available', async () => {
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { BuildVersionBadge } = await import(
      '../src/components/layout/header/BuildVersionBadge'
    );

    const html = renderToStaticMarkup(React.createElement(BuildVersionBadge));
    expect(html).toBe('');
  });

  it('renders version, short commit and a copy affordance', async () => {
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { BuildVersionBadge } = await import(
      '../src/components/layout/header/BuildVersionBadge'
    );

    process.env.NEXT_PUBLIC_APP_VERSION = 'v1.6.1';
    process.env.NEXT_PUBLIC_APP_COMMIT = '622248a1b2c3d4e5f60718293a4b5c6d7e8f9012';
    process.env.NEXT_PUBLIC_APP_BUILT_AT = '2026-11-14T18:30:00.000Z';

    try {
      const html = renderToStaticMarkup(React.createElement(BuildVersionBadge));
      expect(html).toContain('v1.6.1');
      expect(html).toContain('622248a');
      expect(html).not.toContain('622248a1b2c3d');
      expect(html).toContain('user-dropdown-meta-btn');
      expect(html).toContain('کپی اطلاعات نسخه');
      expect(html).toContain('aria-live="polite"');
    } finally {
      delete process.env.NEXT_PUBLIC_APP_VERSION;
      delete process.env.NEXT_PUBLIC_APP_COMMIT;
      delete process.env.NEXT_PUBLIC_APP_BUILT_AT;
    }
  });
});

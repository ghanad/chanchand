import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DateTime } from '../src/components/common/DateTime';
import { PERSIAN_COMMA } from '../src/lib/formatters';

describe('DateTime component', () => {
  it('renders fallback for null/empty values', () => {
    const htmlNull = renderToStaticMarkup(<DateTime value={null} />);
    expect(htmlNull).toContain('datetime-empty');
    expect(htmlNull).toContain('-');

    const htmlEmpty = renderToStaticMarkup(<DateTime value="" emptyText="خالی" />);
    expect(htmlEmpty).toContain('datetime-empty');
    expect(htmlEmpty).toContain('خالی');
  });

  it('renders bidi-safe structure with separate date and time in bdi tags', () => {
    const html = renderToStaticMarkup(<DateTime value="2026-10-23T12:00:00.000Z" />);
    // Must have dir="rtl" on root badge
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('datetime-badge');
    // Must contain datetime-date with bdi
    expect(html).toContain('class="datetime-date"><bdi>');
    // Must contain Persian comma separator
    expect(html).toContain(`class="datetime-sep">${PERSIAN_COMMA}</span>`);
    // Must NOT contain ASCII comma
    expect(html).not.toContain('class="datetime-sep">,</span>');
    // Must contain datetime-time with bdi
    expect(html).toContain('class="datetime-time"><bdi>');
  });

  it('renders clock icon paired with time when showIcon is true', () => {
    const htmlWithIcon = renderToStaticMarkup(<DateTime value="2026-10-23T12:00:00.000Z" showIcon />);
    expect(htmlWithIcon).toContain('datetime-clock-icon');
    // SVG should be inside datetime-time span next to time bdi
    expect(htmlWithIcon).toMatch(/<span class="datetime-time"><svg[^>]*class="datetime-clock-icon"[^>]*>.*<\/svg><bdi>[۰-۹]{2}:[۰-۹]{2}<\/bdi><\/span>/s);
  });

  it('supports custom separator like dash', () => {
    const html = renderToStaticMarkup(<DateTime value="2026-10-23T12:00:00.000Z" separator=" — " />);
    expect(html).toContain('class="datetime-sep"> — </span>');
  });
});

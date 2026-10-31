import { describe, it, expect } from 'vitest';

function getPaginationRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, '...', total];
  }
  if (current >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '...', current - 1, current, current + 1, '...', total];
}

describe('Pagination logic', () => {
  it('returns all page numbers when total pages <= 7', () => {
    expect(getPaginationRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPaginationRange(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('handles start of page range when current <= 4', () => {
    expect(getPaginationRange(1, 10)).toEqual([1, 2, 3, 4, 5, '...', 10]);
    expect(getPaginationRange(4, 10)).toEqual([1, 2, 3, 4, 5, '...', 10]);
  });

  it('handles end of page range when current >= total - 3', () => {
    expect(getPaginationRange(8, 10)).toEqual([1, '...', 6, 7, 8, 9, 10]);
    expect(getPaginationRange(10, 10)).toEqual([1, '...', 6, 7, 8, 9, 10]);
  });

  it('handles middle pages with ellipses on both sides', () => {
    expect(getPaginationRange(5, 10)).toEqual([1, '...', 4, 5, 6, '...', 10]);
    expect(getPaginationRange(6, 12)).toEqual([1, '...', 5, 6, 7, '...', 12]);
  });

  it('calculates slice bounds accurately', () => {
    const pageSize = 20;
    const rows = Array.from({ length: 45 }, (_, i) => i + 1);

    // Page 1
    const p1 = rows.slice(0, 20);
    expect(p1.length).toBe(20);
    expect(p1[0]).toBe(1);
    expect(p1[19]).toBe(20);

    // Page 2
    const p2 = rows.slice(20, 40);
    expect(p2.length).toBe(20);
    expect(p2[0]).toBe(21);
    expect(p2[19]).toBe(40);

    // Page 3 (last page with remainder)
    const p3 = rows.slice(40, 60);
    expect(p3.length).toBe(5);
    expect(p3[0]).toBe(41);
    expect(p3[4]).toBe(45);
  });
});

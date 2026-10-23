const PERSIAN_ARABIC_DIGITS: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

const OUT_OF_STOCK_TOKENS = [
  'out of stock',
  'outofstock',
  'unavailable',
  'sold out',
  'ناموجود',
  'اتمام موجودی',
  'موجود نیست',
];

const IN_STOCK_TOKENS = [
  'in stock',
  'instock',
  'available',
  'موجود',
  'آماده ارسال',
];

export function normalizeDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (match) => PERSIAN_ARABIC_DIGITS[match] ?? match);
}

export function parsePriceToIrr(
  value: string | number | null | undefined,
  multiplier = 1
): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    const amount = Math.floor(value);
    return amount > 0 ? amount * multiplier : null;
  }

  const normalized = normalizeDigits(String(value));
  // Matches digits with delimiters or simple digits: \d[\d\s,._٬،]*\d|\d+
  const regex = /\d[\d\s,._٬،]*\d|\d+/g;
  const matches = normalized.match(regex);
  if (!matches) {
    return null;
  }

  const amounts: number[] = [];
  for (const match of matches) {
    const digits = match.replace(/\D/g, '');
    if (digits) {
      const parsed = parseInt(digits, 10);
      if (!isNaN(parsed) && parsed > 0) {
        amounts.push(parsed);
      }
    }
  }

  if (amounts.length === 0) {
    return null;
  }

  return Math.max(...amounts) * multiplier;
}

export function detectAvailability(value: string | null | undefined): 'in_stock' | 'out_of_stock' | 'unknown' {
  if (!value) {
    return 'unknown';
  }
  const normalized = normalizeDigits(value).toLowerCase();
  for (const token of OUT_OF_STOCK_TOKENS) {
    if (normalized.includes(token.toLowerCase())) {
      return 'out_of_stock';
    }
  }
  for (const token of IN_STOCK_TOKENS) {
    if (normalized.includes(token.toLowerCase())) {
      return 'in_stock';
    }
  }
  return 'unknown';
}

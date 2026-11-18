/**
 * Quota constants live here (not in `connection.ts`) so that schema/migrations
 * can use them without importing the database connection module, which itself
 * imports the schema module.
 */

/** Permanent free product slots every non-admin user gets. */
export const FREE_PRODUCT_LIMIT = 3;

/** Default price of one 30-day paid slot, in Toman. */
export const DEFAULT_SLOT_PRICE_TOMAN = 50000;

/** Length of one paid slot window, in days. */
export const SLOT_DURATION_DAYS = 30;

export function getSlotPriceToman(): number {
  const envVal = process.env.SLOT_PRICE_TOMAN;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_SLOT_PRICE_TOMAN;
}

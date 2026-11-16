import { NextRequest, NextResponse } from 'next/server';
import {
  getDatabase,
  getManagedTargets,
  addManagedProduct,
  deleteManagedProduct,
  isUserTrackingProduct,
} from '@/lib/db';
import { requireAuth } from '@/lib/api-guard';
import { backfillDigikalaPriceHistory } from '@/lib/digikalaHistory';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ key: string }>;
}

function stripColorSuffix(title: string, label: string | null): string {
  if (!label) return title;
  const suffix = ` - ${label}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;
}

/**
 * Switches a tracked product to another Digikala colour (or back to "cheapest
 * anywhere" with `color_id: null`).
 *
 * Colour is part of the product identity, so this creates the target product
 * for the new colour and drops the caller's watch on the old one. A private
 * product that nobody else tracks is removed so the user does not lose a slot.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireAuth(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const { key: rawKey } = await params;
    const key = decodeURIComponent(rawKey);
    const body = await req.json().catch(() => ({}));
    const colorId =
      body?.color_id === undefined || body?.color_id === null
        ? null
        : String(body.color_id).trim() || null;
    const colorLabel =
      body?.color_label === undefined || body?.color_label === null
        ? null
        : String(body.color_label).trim() || null;

    const db = getDatabase();
    const product = db.prepare('SELECT * FROM managed_products WHERE key = ?').get(key) as any;
    if (!product) {
      return NextResponse.json({ error: 'محصول یافت نشد.' }, { status: 404 });
    }

    const isAdmin = auth.user.role === 'admin';
    const isOwner = product.user_id === auth.user.id;
    const isTracker = isUserTrackingProduct(db, auth.user.id, key);
    if (!isAdmin && !isOwner && !isTracker) {
      return NextResponse.json({ error: 'دسترسی غیرمجاز.' }, { status: 403 });
    }

    const target = getManagedTargets(db, key)[0];
    if (!target) {
      return NextResponse.json({ error: 'این محصول منبع قیمت‌گیری ندارد.' }, { status: 400 });
    }

    if ((target.color_id ?? null) === colorId) {
      return NextResponse.json({ product_key: key, unchanged: true });
    }

    const baseTitle = stripColorSuffix(product.title, target.color_label ?? null);

    const created = addManagedProduct(db, {
      title: baseTitle,
      url: target.url,
      source_key: target.source_key,
      user_id: auth.user.id,
      is_public: isAdmin ? Boolean(product.is_public) : false,
      show_usd_chart: isAdmin ? Boolean(product.show_usd_chart) : false,
      show_gold_chart: isAdmin ? Boolean(product.show_gold_chart) : false,
      active_start_hour: product.active_start_hour,
      active_end_hour: product.active_end_hour,
      color_id: colorId,
      color_label: colorLabel,
    });

    const newKey = created.product_key;

    if (newKey !== key) {
      // Drop the caller's watch on the previous colour. A private product that
      // nobody else tracks is deleted so the slot is freed.
      if (product.is_public && !isAdmin) {
        db.prepare('DELETE FROM user_products WHERE user_id = ? AND product_key = ?').run(
          auth.user.id,
          key
        );
      } else {
        try {
          deleteManagedProduct(db, key, { id: auth.user.id, role: auth.user.role });
        } catch {
          db.prepare('DELETE FROM user_products WHERE user_id = ? AND product_key = ?').run(
            auth.user.id,
            key
          );
        }
      }

      if (!created.reused) {
        await backfillDigikalaPriceHistory(db, {
          productKey: newKey,
          url: target.url,
          sourceKey: target.source_key,
          colorId,
          colorLabel,
        });
      }
    }

    return NextResponse.json({
      product_key: newKey,
      previous_key: key,
      reused: Boolean(created.reused),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
  }
}

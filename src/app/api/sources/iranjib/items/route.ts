import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-guard';
import { IranjibAdapter, IranjibItem } from '@/lib/adapters/iranjib';

export const dynamic = 'force-dynamic';

const IRANJIB_URL = 'https://www.iranjib.ir/showgroup/45/%D9%82%DB%8C%D9%85%D8%AA-%D8%AE%D9%88%D8%AF%D8%B1%D9%88-%D8%AA%D9%88%D9%84%DB%8C%D8%AF-%D8%AF%D8%A7%D8%AE%D9%84/';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

let cachedData: {
  timestamp: number;
  items: IranjibItem[];
  companies: string[];
} | null = null;

// Fallback seed catalog in case Iranjib is temporarily unreachable
const FALLBACK_ITEMS: IranjibItem[] = [
  { company: 'ایران خودرو', name: 'پژو 207 اتوماتیک پانوراما', id: '17340', href: null, marketPrice: '۴,۵۲۰,۰۰۰,۰۰۰', factoryPrice: '۲,۲۲۶,۰۰۰,۰۰۰' },
  { company: 'ایران خودرو', name: 'پژو 207 دنده‌ای (هیدرولیک)', id: '19248', href: null, marketPrice: '۲,۸۹۰,۰۰۰,۰۰۰', factoryPrice: '۱,۷۹۲,۰۰۰,۰۰۰' },
  { company: 'ایران خودرو', name: 'پژو 207 دنده‌ای (برقی)', id: '18080', href: null, marketPrice: '۳,۰۵۰,۰۰۰,۰۰۰', factoryPrice: '۱,۸۴۷,۷۰۰,۰۰۰' },
  { company: 'ایران خودرو', name: 'دنا پلاس اتوماتیک', id: '18079', href: null, marketPrice: '۴,۵۲۷,۰۰۰,۰۰۰', factoryPrice: '۲,۶۱۱,۰۰۰,۰۰۰' },
  { company: 'ایران خودرو', name: 'دنا پلاس MT6', id: '19249', href: null, marketPrice: '۳,۳۸۰,۰۰۰,۰۰۰', factoryPrice: '۲,۱۷۲,۷۰۰,۰۰۰' },
  { company: 'ایران خودرو', name: 'تارا اتوماتیک (توربو)', id: '19250', href: null, marketPrice: '۴,۵۴۵,۰۰۰,۰۰۰', factoryPrice: '۲,۷۴۰,۰۰۰,۰۰۰' },
  { company: 'ایران خودرو', name: 'تارا دستی V1', id: '18082', href: null, marketPrice: '۳,۲۸۰,۰۰۰,۰۰۰', factoryPrice: '۲,۰۶۳,۷۰۰,۰۰۰' },
  { company: 'ایران خودرو', name: 'سورن XU7P', id: '18083', href: null, marketPrice: '۲,۶۳۰,۰۰۰,۰۰۰', factoryPrice: 'به زودی' },
  { company: 'ایران خودرو', name: 'سورن (TU5P)', id: '18084', href: null, marketPrice: '۳,۱۷۰,۰۰۰,۰۰۰', factoryPrice: '۱,۹۳۱,۳۷۰,۰۰۰' },
  { company: 'ایران خودرو', name: 'وانت آریسان', id: '16025', href: null, marketPrice: '۲,۲۰۰,۰۰۰,۰۰۰', factoryPrice: '۲,۰۲۶,۴۰۰,۰۰۰' },
  { company: 'ایران خودرو', name: 'راناپلاس', id: '18085', href: null, marketPrice: '۲,۵۳۰,۰۰۰,۰۰۰', factoryPrice: '۱,۶۲۲,۷۰۰,۰۰۰' },
  { company: 'ایران خودرو', name: 'ری را', id: '19251', href: null, marketPrice: '۵,۵۴۰,۰۰۰,۰۰۰', factoryPrice: '۳,۲۰۰,۰۰۰,۰۰۰' },
  { company: 'ایران خودرو', name: 'هایما اس 7 ( S7 ) پرو', id: '18086', href: null, marketPrice: '۷,۳۷۰,۰۰۰,۰۰۰', factoryPrice: 'توقف تولید' },
  { company: 'ایران خودرو', name: 'هایما 8 اس ( 8S )', id: '18087', href: null, marketPrice: '۸,۴۶۰,۰۰۰,۰۰۰', factoryPrice: 'توقف تولید' },

  { company: 'سایپا', name: 'شاهین اتوماتیک G', id: '17955', href: null, marketPrice: '۳,۴۲۵,۰۰۰,۰۰۰', factoryPrice: '۱,۵۶۰,۷۷۶,۰۰۰' },
  { company: 'سایپا', name: 'شاهین G (سانروف)', id: '17956', href: null, marketPrice: '۳,۱۸۰,۰۰۰,۰۰۰', factoryPrice: '۱,۴۵۰,۰۰۰,۰۰۰' },
  { company: 'سایپا', name: 'شاهین اتوماتیک پلاس', id: '19252', href: null, marketPrice: '۴,۲۴۸,۰۰۰,۰۰۰', factoryPrice: '۲,۰۸۰,۰۰۰,۰۰۰' },
  { company: 'سایپا', name: 'کوییک GXR', id: '19253', href: null, marketPrice: '۱,۸۸۵,۰۰۰,۰۰۰', factoryPrice: '۱,۰۴۰,۰۰۰,۰۰۰' },
  { company: 'سایپا', name: 'کوییک S', id: '17957', href: null, marketPrice: '۱,۷۹۷,۰۰۰,۰۰۰', factoryPrice: '۹۹۰,۰۰۰,۰۰۰' },
  { company: 'سایپا', name: 'ساینا S', id: '17958', href: null, marketPrice: '۱,۸۳۰,۰۰۰,۰۰۰', factoryPrice: '۹۹۸,۰۰۰,۰۰۰' },
  { company: 'سایپا', name: 'ساینا دوگانه سوز', id: '17959', href: null, marketPrice: '۲,۰۷۰,۰۰۰,۰۰۰', factoryPrice: '۱,۰۸۵,۰۰۰,۰۰۰' },
  { company: 'سایپا', name: 'اطلس G', id: '19254', href: null, marketPrice: '۲,۲۱۵,۰۰۰,۰۰۰', factoryPrice: '۱,۱۳۰,۰۰۰,۰۰۰' },
  { company: 'سایپا', name: 'اطلس اتوماتیک', id: '19255', href: null, marketPrice: '۳,۲۵۰,۰۰۰,۰۰۰', factoryPrice: 'به زودی' },
  { company: 'سایپا', name: 'سهند S', id: '19256', href: null, marketPrice: '۱,۹۹۵,۰۰۰,۰۰۰', factoryPrice: '۱,۰۳۱,۴۰۰,۰۰۰' },
  { company: 'سایپا', name: 'سایپا 151 GX', id: '17960', href: null, marketPrice: '۱,۶۷۰,۰۰۰,۰۰۰', factoryPrice: '۸۹۰,۰۰۰,۰۰۰' },

  { company: 'مدیران خودرو', name: 'X33 کراس (اتوماتیک)', id: '19257', href: null, marketPrice: '۴,۳۸۰,۰۰۰,۰۰۰', factoryPrice: '۲,۵۸۰,۰۰۰,۰۰۰' },
  { company: 'مدیران خودرو', name: 'X55 پرو', id: '18088', href: null, marketPrice: '۵,۹۰۰,۰۰۰,۰۰۰', factoryPrice: '۳,۶۴۰,۰۰۰,۰۰۰' },
  { company: 'مدیران خودرو', name: 'آریزو 5', id: '18089', href: null, marketPrice: '۵,۴۰۰,۰۰۰,۰۰۰', factoryPrice: '۳,۳۴۰,۰۰۰,۰۰۰' },
  { company: 'مدیران خودرو', name: 'آریزو 6 (Z6 GT)', id: '19258', href: null, marketPrice: '۷,۲۰۰,۰۰۰,۰۰۰', factoryPrice: '۴,۵۴۰,۰۰۰,۰۰۰' },
  { company: 'مدیران خودرو', name: 'فونیکس FX', id: '18090', href: null, marketPrice: '۷,۹۰۰,۰۰۰,۰۰۰', factoryPrice: '۵,۱۲۰,۰۰۰,۰۰۰' },
  { company: 'مدیران خودرو', name: 'تیگو 8 پرومکس', id: '18091', href: null, marketPrice: '۱۲,۵۴۰,۰۰۰,۰۰۰', factoryPrice: '۷,۸۴۰,۰۰۰,۰۰۰' },

  { company: 'کرمان موتور', name: 'جک J4', id: '18092', href: null, marketPrice: '۳,۹۳۰,۰۰۰,۰۰۰', factoryPrice: '۲,۲۴۰,۰۰۰,۰۰۰' },
  { company: 'کرمان موتور', name: 'کی‌ام‌سی J7', id: '18093', href: null, marketPrice: '۷,۴۵۰,۰۰۰,۰۰۰', factoryPrice: '۴,۵۴۰,۰۰۰,۰۰۰' },
  { company: 'کرمان موتور', name: 'کی‌ام‌سی X5', id: '19259', href: null, marketPrice: '۷,۰۸۰,۰۰۰,۰۰۰', factoryPrice: '۴,۴۲۰,۰۰۰,۰۰۰' },
  { company: 'کرمان موتور', name: 'کی‌ام‌سی T8', id: '18094', href: null, marketPrice: '۷,۵۶۰,۰۰۰,۰۰۰', factoryPrice: '۴,۶۴۰,۰۰۰,۰۰۰' },
  { company: 'کرمان موتور', name: 'کی‌ام‌سی T9', id: '19260', href: null, marketPrice: '۱۰,۳۵۰,۰۰۰,۰۰۰', factoryPrice: '۶,۱۰۰,۰۰۰,۰۰۰' },

  { company: 'بهمن موتور', name: 'فیدلیتی پرستیژ (7 نفره)', id: '19261', href: null, marketPrice: '۱۰,۹۰۰,۰۰۰,۰۰۰', factoryPrice: '۶,۵۴۰,۰۰۰,۰۰۰' },
  { company: 'بهمن موتور', name: 'فیدلیتی الیت (7 نفره)', id: '19262', href: null, marketPrice: '۸,۰۵۰,۰۰۰,۰۰۰', factoryPrice: '۵,۲۰۰,۰۰۰,۰۰۰' },
  { company: 'بهمن موتور', name: 'رسپکت (نیو)', id: '19263', href: null, marketPrice: '۵,۷۸۰,۰۰۰,۰۰۰', factoryPrice: '۳,۷۶۰,۰۰۰,۰۰۰' },
];

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.authorized) {
    return auth.response;
  }

  const now = Date.now();
  if (cachedData && now - cachedData.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({
      ok: true,
      url: IRANJIB_URL,
      companies: cachedData.companies,
      items: cachedData.items,
      cached: true,
    });
  }

  try {
    const res = await fetch(IRANJIB_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fa-IR,fa;q=0.9,en-US;q=0.6,en;q=0.5',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const html = await res.text();
    const adapter = new IranjibAdapter();
    const items = adapter.extractItems(html);

    if (!items || items.length === 0) {
      throw new Error('no items parsed');
    }

    const companySet = new Set<string>();
    for (const it of items) {
      if (it.company) companySet.add(it.company);
    }
    const companies = ['همه', ...Array.from(companySet)];

    cachedData = {
      timestamp: now,
      items,
      companies,
    };

    return NextResponse.json({
      ok: true,
      url: IRANJIB_URL,
      companies,
      items,
      cached: false,
    });
  } catch (err: any) {
    // If live fetch failed, return fallback catalog
    const companySet = new Set<string>();
    for (const it of FALLBACK_ITEMS) {
      if (it.company) companySet.add(it.company);
    }
    const companies = ['همه', ...Array.from(companySet)];

    return NextResponse.json({
      ok: true,
      url: IRANJIB_URL,
      companies,
      items: FALLBACK_ITEMS,
      fallback: true,
      warning: err.message || 'live fetch failed, served cached fallback',
    });
  }
}

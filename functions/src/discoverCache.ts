import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

const KICKSDB_API_KEY = defineSecret("KICKSDB_API_KEY");

const BASE_URL = "https://api.kicks.dev/v3";
const PAGES_PER_BRAND = 5;
const LIMIT_PER_PAGE = 20; // 100 sneakers/brand, ~800 total pool

// Mirrors DISCOVER_BRANDS in src/app/discover/DiscoverPage.tsx — keep in sync.
const BRANDS = ["Nike", "Jordan", "Adidas", "New Balance", "Asics", "Puma", "Reebok", "Vans"];

interface CachedSneaker {
  id: string;
  name: string;
  brand: string;
  styleId: string;
  imageUrl: string;
  source: "stockx";
  rank?: number;
  weekly_orders?: number;
  min_price?: number;
  max_price?: number;
  avg_price?: number;
}

interface StockXProduct {
  id?: string;
  title?: string;
  brand?: string;
  sku?: string;
  image?: string;
  rank?: number;
  weekly_orders?: number;
  min_price?: number;
  max_price?: number;
  avg_price?: number;
}

function mapProduct(p: StockXProduct): CachedSneaker | null {
  if (!p.id || !p.title || !p.image) return null;
  const styleId = (p.sku ?? "").split("/")[0].trim();
  return {
    id: p.id,
    name: p.title,
    brand: p.brand ?? "",
    styleId,
    imageUrl: p.image,
    source: "stockx",
    rank: p.rank,
    weekly_orders: p.weekly_orders,
    min_price: p.min_price,
    max_price: p.max_price,
    avg_price: p.avg_price,
  };
}

async function fetchBrandPool(brand: string, apiKey: string): Promise<CachedSneaker[]> {
  const results: CachedSneaker[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= PAGES_PER_BRAND; page++) {
    const filterStr = `brand = "${brand}"`;
    const url = `${BASE_URL}/stockx/products?filters=${encodeURIComponent(filterStr)}&limit=${LIMIT_PER_PAGE}&page=${page}&currency=USD&market=US`;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!res.ok) {
        logger.warn(`discoverCache: ${brand} page ${page} failed with ${res.status}`);
        continue;
      }
      const data = (await res.json()) as { data?: StockXProduct[] };
      for (const raw of data.data ?? []) {
        const mapped = mapProduct(raw);
        if (mapped && mapped.styleId && !seen.has(mapped.styleId)) {
          seen.add(mapped.styleId);
          results.push(mapped);
        }
      }
    } catch (err) {
      logger.warn(`discoverCache: ${brand} page ${page} threw`, err);
    }
    // One request at a time, with a small gap — kicks.dev 500s under concurrency.
    await new Promise((r) => setTimeout(r, 200));
  }

  return results;
}

/**
 * refreshDiscoverCache — sweeps kicks.dev sequentially (never concurrently,
 * which is what triggers their 500s) and writes a deep per-brand pool to
 * Firestore. The Discover page reads this pool instead of calling kicks.dev
 * directly, so user traffic generates zero third-party API calls.
 */
export const refreshDiscoverCache = onSchedule(
  {
    schedule: "every 6 hours",
    timeoutSeconds: 300,
    secrets: [KICKSDB_API_KEY],
  },
  async () => {
    const apiKey = KICKSDB_API_KEY.value();
    const brands: Record<string, CachedSneaker[]> = {};

    for (const brand of BRANDS) {
      brands[brand] = await fetchBrandPool(brand, apiKey);
    }

    const total = Object.values(brands).reduce((sum, arr) => sum + arr.length, 0);

    await getFirestore().doc("discoverCache/pool").set({
      brands,
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info(`discoverCache: refreshed ${total} sneakers across ${BRANDS.length} brands`);
  }
);

import type { KicksDBProduct, SearchResult } from "@/types";

const KICKSDB_API_KEY = import.meta.env.VITE_KICKSDB_API_KEY;
const BASE_URL = "https://api.kicks.dev/v3";

// Map StockX product to SearchResult
function mapStockXProduct(product: KicksDBProduct): SearchResult {
  // Some SKUs contain " / " separating two colorway codes (e.g. "IZ6735-100 / IZ6736-100").
  // Take the first code only — Firestore doc IDs cannot contain "/" or spaces.
  const rawSku = product.sku ?? "";
  const styleId = rawSku.split("/")[0].trim();

  return {
    id: product.id!,
    name: product.title!,
    brand: product.brand,
    styleId,
    imageUrl: product.image!,
    source: "stockx",
    rank: product.rank,
    weekly_orders: product.weekly_orders,
    min_price: product.min_price,
    max_price: product.max_price,
    avg_price: product.avg_price,
  };
}

// Map GOAT product to SearchResult
function mapGoatProduct(product: KicksDBProduct): SearchResult {
  return {
    id: product.id!.toString(),
    name: product.name!,
    brand: product.brand,
    styleId: product.sku,
    imageUrl: product.image_url!,
    source: "goat",
    rank: product.rank,
    weekly_orders: product.weekly_orders,
  };
}

// Search StockX
async function searchStockX(query: string): Promise<SearchResult[]> {
  const response = await fetch(
    `${BASE_URL}/stockx/products?query=${encodeURIComponent(
      query
    )}&limit=20&currency=USD&market=US`,
    {
      headers: {
        Authorization: `Bearer ${KICKSDB_API_KEY}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("StockX search failed");
  }

  const data = await response.json();
  return data.data.map(mapStockXProduct);
}

// Search GOAT
async function searchGoat(query: string): Promise<SearchResult[]> {
  const response = await fetch(
    `${BASE_URL}/goat/products?query=${encodeURIComponent(
      query
    )}&limit=20&currency=USD`,
    {
      headers: {
        Authorization: `Bearer ${KICKSDB_API_KEY}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("GOAT search failed");
  }

  const data = await response.json();
  return data.data.map(mapGoatProduct);
}

// Main search function with fallback
export async function searchSneakers(query: string): Promise<SearchResult[]> {
  try {
    // Try StockX first
    const stockxResults = await searchStockX(query);

    if (stockxResults.length > 0) {
      return stockxResults;
    }

    // Fallback to GOAT if no StockX results
    console.log("No StockX results, trying GOAT...");
    const goatResults = await searchGoat(query);
    return goatResults;
  } catch (error) {
    console.error("Search error:", error);
    throw error;
  }
}

// kicks.dev intermittently returns 500 when several requests hit the key
// concurrently (Discover fires one per brand) — retry transient 5xx with a
// short backoff before giving up.
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 2
): Promise<Response> {
  let response = await fetch(url, init);
  for (let attempt = 1; attempt <= retries && response.status >= 500; attempt++) {
    await new Promise((r) => setTimeout(r, 300 * attempt + Math.random() * 300));
    response = await fetch(url, init);
  }
  return response;
}

// Fetch sneakers for the Discover feature.
// Confirmed from API testing:
//  - brand filter works: filters=brand%20%3D%20%22Nike%22
//  - page= parameter works for pagination (meta.total = 1000 per brand)
//  - query=sneakers returns non-sneaker garbage (Valentino, books, etc.) — never use it
export async function fetchRecentReleases(options?: {
  brand: string; // required — unfiltered query returns irrelevant results
  limit?: number;
  page?: number;
}): Promise<SearchResult[]> {
  if (!options?.brand) return [];

  const { brand, limit = 12, page = 1 } = options;
  const filterStr = `brand = "${brand}"`;
  const url = `${BASE_URL}/stockx/products?filters=${encodeURIComponent(filterStr)}&limit=${limit}&page=${page}&currency=USD&market=US`;

  try {
    const response = await fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${KICKSDB_API_KEY}` },
    });
    if (!response.ok) throw new Error(`Discover fetch failed: ${response.status}`);
    const data = await response.json();
    return (data.data ?? []).map(mapStockXProduct);
  } catch (error) {
    console.error("fetchRecentReleases error:", error);
    return [];
  }
}

// Fetch current market price for a product
export const fetchCurrentPrice = async (
  apiID: string,
  source: "stockx" | "goat",
  fallbackPrice?: number
): Promise<number | null> => {
  try {
    if (source === "stockx") {
      // For StockX, fetch the product details and get avg_price
      const response = await fetch(`${BASE_URL}/stockx/products/${apiID}`, {
        headers: {
          Authorization: `Bearer ${KICKSDB_API_KEY}`,
        },
      });

      if (!response.ok) {
        console.warn(`StockX product fetch failed for ${apiID}`);
        return fallbackPrice ?? null;
      }

      const data = await response.json();
      const avgPrice = data.data?.avg_price;

      // Check if avg_price exists and is > 0
      if (avgPrice && avgPrice > 0) {
        return avgPrice;
      }

      return fallbackPrice ?? null;
    } else {
      // For GOAT, fetch sales and get most recent amount
      const response = await fetch(`${BASE_URL}/goat/products/${apiID}/sales`, {
        headers: {
          Authorization: `Bearer ${KICKSDB_API_KEY}`,
        },
      });

      if (!response.ok) {
        console.warn(`GOAT sales fetch failed for ${apiID}`);
        return fallbackPrice ?? null;
      }

      const data = await response.json();
      const sales = data.data;

      if (!sales || sales.length === 0) {
        console.warn(`No GOAT sales data for ${apiID}`);
        return fallbackPrice ?? null;
      }

      // Get the most recent sale (first item) and check if > 0
      const saleAmount = sales[0]?.amount;
      if (saleAmount && saleAmount > 0) {
        return saleAmount;
      }

      return fallbackPrice ?? null;
    }
  } catch (error) {
    console.error(`Error fetching price for ${apiID}:`, error);
    return fallbackPrice ?? null;
  }
};

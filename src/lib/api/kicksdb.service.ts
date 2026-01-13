import type { KicksDBProduct, SearchResult } from "@/types";

const KICKSDB_API_KEY = import.meta.env.VITE_KICKSDB_API_KEY;
const BASE_URL = "https://api.kicks.dev/v3";

// Map StockX product to SearchResult
function mapStockXProduct(product: KicksDBProduct): SearchResult {
  return {
    id: product.id!,
    name: product.title!,
    brand: product.brand,
    styleId: product.sku,
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

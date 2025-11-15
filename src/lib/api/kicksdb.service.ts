const KICKSDB_API_KEY = import.meta.env.VITE_KICKSDB_API_KEY;
const BASE_URL = "https://api.kicks.dev/v3";

export interface KicksDBProduct {
  // StockX fields
  id?: string;
  title?: string;
  image?: string;

  // GOAT fields (different names)
  name?: string;
  image_url?: string;

  // Common fields
  brand: string;
  model: string;
  sku: string;
  slug: string;
}

export interface SearchResult {
  id: string;
  name: string;
  brand: string;
  styleId: string;
  imageUrl: string;
  source: "stockx" | "goat";
}

// Map StockX product to SearchResult
function mapStockXProduct(product: KicksDBProduct): SearchResult {
  return {
    id: product.id!,
    name: product.title!,
    brand: product.brand,
    styleId: product.sku,
    imageUrl: product.image!,
    source: "stockx",
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

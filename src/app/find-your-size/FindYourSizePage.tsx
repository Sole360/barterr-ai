import { useState, useEffect, useRef } from "react";
import { Navbar } from "@/components/shared/Navbar";
import { PageTransition } from "@/components/shared/PageTransition";
import { PostDetailModal } from "@/components/dialogs/PostDetailModal";
import { BrandPickerSheet, KNOWN_BRANDS } from "@/components/shared/BrandPickerSheet";
import { searchClient, ALGOLIA_INDEX } from "@/lib/algolia/config";
import { getPostById } from "@/lib/firebase/posts.service";
import type { AlgoliaHit, Post, BrandFilter } from "@/types";

const SIZES = [
  5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5,
  10, 10.5, 11, 11.5, 12, 12.5, 13, 14, 15,
];

const PINNED_BRANDS: BrandFilter[] = ["All", "Nike", "Adidas", "Jordan", "New Balance", "Other"];
const PAGE_SIZE = 24;

export const FindYourSizePage = () => {
  const [selectedSizes, setSelectedSizes] = useState<number[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<BrandFilter>("All");
  const [customBrand, setCustomBrand] = useState<string>("OTHER_ALL");
  const [brandSheetOpen, setBrandSheetOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<AlgoliaHit[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const canLoadMoreRef = useRef(false);

  const fetchPage = async (
    sizes: number[],
    brand: BrandFilter,
    custom: string,
    pageNum: number,
    append: boolean
  ) => {
    if (sizes.length === 0) return;

    append ? setLoadingMore(true) : setLoading(true);

    try {
      const sizeFilter = sizes.map((s) => `size = ${s}`).join(" OR ");
      const brandFilter =
        brand === "All"
          ? ""
          : brand === "Other" && custom === "OTHER_ALL"
          ? KNOWN_BRANDS.map((b) => ` AND NOT brand:"${b}"`).join("")
          : brand === "Other"
          ? ` AND brand:"${custom}"`
          : ` AND brand:"${brand}"`;
      const filters = `(${sizeFilter})${brandFilter}`;

      const { results: searchResults } = await searchClient.search<AlgoliaHit>([
        {
          indexName: ALGOLIA_INDEX,
          params: {
            query: "",
            filters,
            page: pageNum,
            hitsPerPage: PAGE_SIZE,
            attributesToRetrieve: [
              "objectID",
              "productName",
              "brand",
              "styleId",
              "size",
              "productImageUrl",
            ],
          },
        },
      ]);

      if (
        Array.isArray(searchResults) &&
        searchResults[0] &&
        "hits" in searchResults[0]
      ) {
        const res = searchResults[0] as { hits: AlgoliaHit[]; nbHits: number };
        setResults((prev) => (append ? [...prev, ...res.hits] : res.hits));
        setTotalHits(res.nbHits);
      }
    } catch (err) {
      console.error("Algolia error:", err);
    } finally {
      append ? setLoadingMore(false) : setLoading(false);
    }
  };

  const applyFilter = (sizes: number[], brand: BrandFilter, custom: string) => {
    setSelectedSizes(sizes);
    setSelectedBrand(brand);
    setCustomBrand(custom);
    setPage(0);
    setResults([]);
    setTotalHits(0);
    fetchPage(sizes, brand, custom, 0, false);
  };

  const toggleSize = (size: number) => {
    const next = selectedSizes.includes(size)
      ? selectedSizes.filter((s) => s !== size)
      : [...selectedSizes, size];
    applyFilter(next, selectedBrand, customBrand);
  };

  const changeBrand = (brand: BrandFilter) => {
    if (brand === "Other") {
      setBrandSheetOpen(true);
      return;
    }
    applyFilter(selectedSizes, brand, "OTHER_ALL");
  };

  const handleCustomBrandSelect = (brand: string) => {
    applyFilter(selectedSizes, "Other", brand);
  };

  const clearSizes = () => {
    setSelectedSizes([]);
    setResults([]);
    setTotalHits(0);
    setPage(0);
  };

  // Infinite scroll observer
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && canLoadMoreRef.current) {
          canLoadMoreRef.current = false;
          const nextPage = page + 1;
          setPage(nextPage);
          fetchPage(selectedSizes, selectedBrand, customBrand, nextPage, true);
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
    // Re-create observer whenever page/filters change so closure values are fresh
  }, [page, selectedSizes, selectedBrand, customBrand]);

  const handleSelectPost = async (postId: string) => {
    try {
      const post = await getPostById(postId);
      if (post) setSelectedPost(post);
    } catch (err) {
      console.error("Error loading post:", err);
    }
  };

  const hasSelection = selectedSizes.length > 0;
  const hasMore = results.length < totalHits;

  // Update ref every render
  canLoadMoreRef.current = hasMore && !loadingMore && !loading;

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        <Navbar />

        <main className="pt-24 md:pt-20 pb-24 md:pb-10 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">

            {/* Header */}
            <div className="mb-6 pt-4">
              <h1 className="text-3xl font-bold text-foreground">Find Your Size</h1>
              <p className="text-muted-foreground mt-1">
                Pick your size to see what's available for trade right now.
              </p>
            </div>

            {/* Brand filter */}
            <div className="mb-4 -mx-4 px-4 overflow-x-auto scrollbar-hide">
              <div className="flex gap-2 min-w-max pb-1">
                {PINNED_BRANDS.map((brand) => {
                  const isActive = selectedBrand === brand;
                  const label =
                    brand === "Other" && isActive && customBrand !== "OTHER_ALL"
                      ? customBrand
                      : brand;
                  return (
                    <button
                      key={brand}
                      onClick={() => changeBrand(brand)}
                      className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                        isActive
                          ? "bg-[#3366FF] text-white shadow-md shadow-[#3366FF]/25"
                          : "bg-card text-foreground border border-border hover:border-[#3366FF]/50"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <BrandPickerSheet
              open={brandSheetOpen}
              onClose={() => setBrandSheetOpen(false)}
              activeBrand={selectedBrand === "Other" ? customBrand : ""}
              onSelect={handleCustomBrandSelect}
            />

            {/* Size picker */}
            <div className="mb-6">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Select size(s)
              </p>
              <div className="flex flex-wrap gap-2">
                {SIZES.map((size) => {
                  const active = selectedSizes.includes(size);
                  return (
                    <button
                      key={size}
                      onClick={() => toggleSize(size)}
                      className={`w-14 h-10 rounded-xl text-sm font-semibold transition-all ${
                        active
                          ? "bg-[#3366FF] text-white shadow-md shadow-[#3366FF]/25 scale-105"
                          : "bg-card text-foreground border border-border hover:border-[#3366FF]/50"
                      }`}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
              {hasSelection && (
                <button
                  onClick={clearSizes}
                  className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear selection
                </button>
              )}
            </div>

            {/* Results count */}
            {hasSelection && !loading && (
              <p className="text-sm text-muted-foreground mb-5">
                {totalHits}{" "}
                {totalHits === 1 ? "sneaker" : "sneakers"} available
                {selectedSizes.length === 1
                  ? ` in size ${selectedSizes[0]}`
                  : ` across ${selectedSizes.length} sizes`}
              </p>
            )}

            {/* Initial loading skeleton */}
            {loading && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {[...Array(8)].map((_, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-2xl overflow-hidden animate-pulse shadow-[0_2px_16px_rgba(0,0,0,0.07)]"
                  >
                    <div className="aspect-square bg-gray-100 dark:bg-muted" />
                    <div className="p-4 space-y-2.5">
                      <div className="h-2.5 bg-muted rounded-full w-1/3" />
                      <div className="h-3.5 bg-muted rounded-full w-full" />
                      <div className="h-3.5 bg-muted rounded-full w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty — no size selected */}
            {!hasSelection && !loading && (
              <div className="text-center py-20">
                <p className="text-5xl mb-4">👟</p>
                <p className="text-foreground font-semibold mb-1">What's your size?</p>
                <p className="text-sm text-muted-foreground">
                  Select one or more sizes above to see available listings.
                </p>
              </div>
            )}

            {/* Zero results */}
            {hasSelection && !loading && results.length === 0 && (
              <div className="text-center py-20">
                <p className="text-foreground font-semibold mb-1">
                  Nothing in{" "}
                  {selectedSizes.length === 1
                    ? `size ${selectedSizes[0]}`
                    : `sizes ${selectedSizes.join(", ")}`}{" "}
                  right now
                </p>
                <p className="text-sm text-muted-foreground">
                  Check back soon — new listings are added every day.
                </p>
              </div>
            )}

            {/* Results grid */}
            {!loading && results.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {results.map((hit) => (
                  <SizeResultCard
                    key={hit.objectID}
                    hit={hit}
                    onClick={() => handleSelectPost(hit.objectID)}
                  />
                ))}
              </div>
            )}

            {/* Bottom spinner while fetching more */}
            {loadingMore && (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 rounded-full border-2 border-[#3366FF]/30 border-t-[#3366FF] animate-spin" />
              </div>
            )}

            {/* Invisible sentinel */}
            <div ref={sentinelRef} className="h-1" />
          </div>
        </main>

        {selectedPost && (
          <PostDetailModal
            open={!!selectedPost}
            onClose={() => setSelectedPost(null)}
            post={selectedPost}
          />
        )}
      </div>
    </PageTransition>
  );
};

function SizeResultCard({ hit, onClick }: { hit: AlgoliaHit; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group text-left bg-white dark:bg-card rounded-2xl overflow-hidden
        shadow-[0_2px_16px_rgba(0,0,0,0.07)]
        hover:shadow-[0_12px_40px_rgba(0,0,0,0.13)]
        hover:-translate-y-1
        transition-all duration-200"
    >
      <div className="relative aspect-square bg-white overflow-hidden rounded-t-2xl">
        <img
          src={hit.productImageUrl}
          alt={hit.productName}
          className="absolute inset-0 w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-300"
          referrerPolicy="no-referrer"
        />
        {hit.size != null && (
          <span className="absolute top-2 right-2 bg-[#3366FF] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
            Sz {hit.size}
          </span>
        )}
      </div>
      <div className="px-4 pt-3.5 pb-4">
        <p className="text-[11px] font-bold text-[#3366FF] mb-1.5 uppercase tracking-widest">
          {hit.brand}
        </p>
        <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
          {hit.productName}
        </h3>
        {hit.styleId && (
          <p className="text-xs text-muted-foreground mt-1">{hit.styleId}</p>
        )}
      </div>
    </button>
  );
}

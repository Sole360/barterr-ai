import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Plus, Ruler, Compass } from "lucide-react";
import { Navbar } from "@/components/shared/Navbar";
import { PostDetailModal } from "@/components/dialogs/PostDetailModal";
import { AddSneakerDialog } from "@/components/dialogs/AddSneakerDialog";
import { PageTransition } from "@/components/shared/PageTransition";
import { BrandPickerSheet, KNOWN_BRANDS } from "@/components/shared/BrandPickerSheet";
import { HorizontalScrollRow } from "@/components/dashboard/HorizontalScrollRow";
import { useRecommendations } from "@/lib/firebase/useRecommendations";
import type { RecommendedListing, RecommendedPartner } from "@/lib/firebase/useRecommendations";
import { useAuth } from "@/lib/contexts/auth.context";
import { useTour } from "@/lib/contexts/tour.context";
import type { Post, BrandFilter } from "@/types";
import {
  subscribeToPosts,
  subscribeToPostsByBrand,
} from "@/lib/firebase/posts.service";

const PINNED_BRANDS: BrandFilter[] = ["All", "Nike", "Adidas", "Jordan", "New Balance", "Other"];
const PAGE_SIZE = 20;

export const DashboardPage = () => {
  const { currentUser, userProfile } = useAuth();
  const { isRunning, startTour } = useTour();
  const { listings: forYou, partners: tradePartners, loading: recsLoading } = useRecommendations();
  const [selectedBrand, setSelectedBrand] = useState<BrandFilter>("All");
  // customBrand: "OTHER_ALL" = all non-featured brands, any other string = specific brand like "Gucci"
  const [customBrand, setCustomBrand] = useState<string>("OTHER_ALL");
  const [brandSheetOpen, setBrandSheetOpen] = useState(false);
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [addSneakerOpen, setAddSneakerOpen] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const canLoadMoreRef = useRef(false);

  const handleBrandChange = (brand: BrandFilter) => {
    if (brand === "Other") {
      setBrandSheetOpen(true);
      return;
    }
    setSelectedBrand(brand);
    setPageLimit(PAGE_SIZE);
  };

  const handleCustomBrandSelect = (brand: string) => {
    setCustomBrand(brand);
    setSelectedBrand("Other");
    setPageLimit(PAGE_SIZE);
  };

  useEffect(() => {
    setError(null);

    if (pageLimit === PAGE_SIZE) {
      // Initial load or brand change — full skeleton
      setLoading(true);
      setLoadingMore(false);
      setPosts([]);
    } else {
      // User scrolled to bottom — keep existing results, show bottom spinner
      setLoadingMore(true);
    }

    const handlePosts = (fetchedPosts: Post[]) => {
      setPosts(fetchedPosts);
      setLoading(false);
      setLoadingMore(false);
    };
    const handleError = () => {
      setError("Failed to load sneakers");
      setLoading(false);
      setLoadingMore(false);
    };

    // "Other" + specific brand (e.g. Gucci) → brand subscription; OTHER_ALL → fetch all, filter client-side
    const unsubscribe =
      selectedBrand === "All" ||
      (selectedBrand === "Other" && customBrand === "OTHER_ALL")
        ? subscribeToPosts(handlePosts, handleError, pageLimit)
        : selectedBrand === "Other"
        ? subscribeToPostsByBrand(customBrand, handlePosts, handleError, pageLimit)
        : subscribeToPostsByBrand(selectedBrand, handlePosts, handleError, pageLimit);

    return () => unsubscribe?.();
  }, [selectedBrand, customBrand, pageLimit]);

  // Auto-start tour on first visit
  useEffect(() => {
    if (userProfile && !userProfile.hasSeenTour && !isRunning) {
      const t = setTimeout(startTour, 800);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.hasSeenTour]);

  // Infinite scroll — set up observer once, read canLoadMoreRef on each intersection
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && canLoadMoreRef.current) {
          canLoadMoreRef.current = false; // prevent double-fire before next render
          setPageLimit((p) => p + PAGE_SIZE);
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const visiblePosts = posts.filter((post) => {
    // Only show posts that have at least one owner (i.e. someone has it in their collection)
    // Posts created from wishlist/discover swipes have owners:[] and should not surface here
    const owners = post.owners ?? [];
    if (owners.length === 0) return false;

    // Hide posts where the current user is the only owner
    if (currentUser && owners.length === 1 && owners[0].userId === currentUser.uid) return false;

    // OTHER_ALL = any brand not in the four pinned brands
    if (selectedBrand === "Other" && customBrand === "OTHER_ALL")
      return !KNOWN_BRANDS.includes(post.brand);
    return true;
  });

  // Update every render so the observer always sees current values
  canLoadMoreRef.current = !loading && !loadingMore && !error && visiblePosts.length >= pageLimit;

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        <Navbar />

        <main className="pt-24 md:pt-20 pb-24 md:pb-10 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">

            {/* Header */}
            <div className="mb-6 pt-4" data-tour="listings">
              <h1 className="text-3xl font-bold text-foreground">Discover</h1>
              <p className="text-muted-foreground mt-1">Browse sneakers available for trade</p>
            </div>

            {/* Brand filter */}
            <div className="mb-6 -mx-4 px-4 overflow-x-auto scrollbar-hide">
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
                      onClick={() => handleBrandChange(brand)}
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

            {/* Shortcut cards */}
            <div className="mb-5 flex flex-wrap gap-3">
              <Link
                to="/find-your-size"
                className="flex items-center gap-2.5 px-4 py-3 rounded-2xl border border-[#3366FF]/30 bg-[#3366FF]/5 hover:bg-[#3366FF]/10 transition-colors group"
              >
                <Ruler className="w-4 h-4 text-[#3366FF] shrink-0" />
                <span className="text-sm font-semibold text-[#3366FF]">Find your size</span>
                <span className="text-[#3366FF]/60 group-hover:translate-x-0.5 transition-transform text-sm">→</span>
              </Link>
              <Link
                to="/discover"
                className="flex items-center gap-2.5 px-4 py-3 rounded-2xl border border-[#33FF99]/40 bg-[#33FF99]/10 hover:bg-[#33FF99]/20 transition-colors group"
              >
                <Compass className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-sm font-semibold text-emerald-700">Discover new drops</span>
                <span className="text-emerald-600/60 group-hover:translate-x-0.5 transition-transform text-sm">→</span>
              </Link>
            </div>

            {/* For You — personalized listing recommendations */}
            {(recsLoading || forYou.length > 0) && (
              <HorizontalScrollRow
                title="For You"
                subtitle="Based on your swipes and trades"
                loading={recsLoading}
              >
                {forYou.map((item) => (
                  <RecommendedListingCard key={item.postId} item={item} />
                ))}
              </HorizontalScrollRow>
            )}

            {/* People to Trade With */}
            {(recsLoading || tradePartners.length > 0) && (
              <HorizontalScrollRow
                title="People to Trade With"
                subtitle="Collectors with similar taste"
                loading={recsLoading}
                itemCount={4}
              >
                {tradePartners.map((partner) => (
                  <RecommendedPartnerCard key={partner.userId} partner={partner} />
                ))}
              </HorizontalScrollRow>
            )}

            {/* Results count */}
            {!loading && !error && (
              <p className="text-sm text-muted-foreground mb-5">
                {visiblePosts.length} {visiblePosts.length === 1 ? "sneaker" : "sneakers"} available
              </p>
            )}

            {/* Error */}
            {error && (
              <div className="text-center py-16">
                <p className="text-destructive mb-3">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="text-sm text-[#3366FF] hover:underline"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Initial loading skeleton */}
            {loading && !error && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl overflow-hidden animate-pulse shadow-[0_2px_16px_rgba(0,0,0,0.07)]">
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

            {/* Sneaker grid */}
            {!loading && !error && visiblePosts.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {visiblePosts.map((post) => (
                  <SneakerCard
                    key={post.postId}
                    post={post}
                    onClick={() => setSelectedPost(post)}
                  />
                ))}
              </div>
            )}

            {/* Empty */}
            {!loading && !error && visiblePosts.length === 0 && (
              <div className="text-center py-16">
                <p className="text-foreground font-semibold mb-1">No sneakers found</p>
                <p className="text-sm text-muted-foreground">
                  {selectedBrand === "All"
                    ? "Be the first to add a sneaker!"
                    : `Try a different brand or add some ${selectedBrand} sneakers`}
                </p>
              </div>
            )}

            {/* Bottom spinner while fetching more */}
            {loadingMore && (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 rounded-full border-2 border-[#3366FF]/30 border-t-[#3366FF] animate-spin" />
              </div>
            )}

            {/* Invisible sentinel — IntersectionObserver watches this */}
            <div ref={sentinelRef} className="h-1" />
          </div>
        </main>

        {/* FAB */}
        <button
          data-tour="add-sneaker-desktop"
          onClick={() => setAddSneakerOpen(true)}
          className="hidden md:flex fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg hover:scale-110 transition-all items-center justify-center z-40 bg-gradient-to-br from-[#3366FF] to-[#33FF99]"
        >
          <Plus className="w-6 h-6 text-white" />
        </button>

        {selectedPost && (
          <PostDetailModal
            open={!!selectedPost}
            onClose={() => setSelectedPost(null)}
            post={selectedPost}
          />
        )}

        <AddSneakerDialog
          open={addSneakerOpen}
          onClose={() => setAddSneakerOpen(false)}
        />
      </div>
    </PageTransition>
  );
};

function RecommendedListingCard({ item }: { item: RecommendedListing }) {
  return (
    <Link
      to={`/post/${item.postId}`}
      className="shrink-0 w-36 group text-left"
    >
      <div className="aspect-square bg-white dark:bg-card rounded-2xl overflow-hidden
        shadow-[0_2px_12px_rgba(0,0,0,0.06)]
        group-hover:shadow-[0_8px_28px_rgba(0,0,0,0.12)]
        group-hover:-translate-y-0.5 transition-all duration-200"
      >
        <img
          src={item.productImageUrl}
          alt={item.productName}
          className="w-full h-full object-contain p-3 group-hover:scale-105 transition-transform duration-300"
          referrerPolicy="no-referrer"
        />
      </div>
      <div className="mt-2 px-0.5">
        <p className="text-[10px] font-bold text-[#3366FF] uppercase tracking-widest truncate">
          {item.brand}
        </p>
        <p className="text-xs font-semibold text-foreground line-clamp-2 leading-snug mt-0.5">
          {item.productName}
        </p>
      </div>
    </Link>
  );
}

function RecommendedPartnerCard({ partner }: { partner: RecommendedPartner }) {
  const initials = partner.displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Link
      to={`/profile/${partner.userId}`}
      className="shrink-0 w-28 group text-center"
    >
      <div className="w-16 h-16 mx-auto rounded-full overflow-hidden bg-muted border-2 border-transparent
        group-hover:border-[#3366FF]/40 transition-all duration-200
        shadow-[0_2px_12px_rgba(0,0,0,0.08)]"
      >
        {partner.photoURL ? (
          <img
            src={partner.photoURL}
            alt={partner.displayName}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#3366FF]/20 to-[#33FF99]/20">
            <span className="text-sm font-bold text-[#3366FF]">{initials}</span>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs font-semibold text-foreground truncate">{partner.displayName}</p>
      {partner.sharedBrands.length > 0 && (
        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
          {partner.sharedBrands.slice(0, 2).join(" · ")}
        </p>
      )}
    </Link>
  );
}

function SneakerCard({ post, onClick }: { post: Post; onClick: () => void }) {
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
          src={post.productImageUrl}
          alt={post.title}
          className="absolute inset-0 w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-300"
          referrerPolicy="no-referrer"
        />
      </div>
      <div className="px-4 pt-3.5 pb-4">
        <p className="text-[11px] font-bold text-[#3366FF] mb-1.5 uppercase tracking-widest">
          {post.brand}
        </p>
        <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
          {post.title}
        </h3>
      </div>
    </button>
  );
}

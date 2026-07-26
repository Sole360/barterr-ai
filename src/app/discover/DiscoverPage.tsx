import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/contexts/auth.context";
import { fetchRecentReleases } from "@/lib/api/kicksdb.service";
import {
  createOrUpdatePost,
  addToWishlist,
} from "@/lib/firebase/posts.service";
import { SwipeCardStack } from "@/components/shared/SwipeCardStack";
import { Navbar } from "@/components/shared/Navbar";
import type { SearchResult } from "@/types";

const DISCOVER_BRANDS = [
  "Nike",
  "Jordan",
  "Adidas",
  "New Balance",
  "Asics",
  "Puma",
  "Reebok",
  "Vans",
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dedupeByStyleId(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    if (!r.styleId || seen.has(r.styleId)) return false;
    seen.add(r.styleId);
    return true;
  });
}

export const DiscoverPage = () => {
  const { currentUser, userProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const isOnboarding = searchParams.get("onboarding") === "true";

  const [initialCards, setInitialCards] = useState<SearchResult[]>([]);
  const [swipedSet, setSwipedSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [isEmpty, setIsEmpty] = useState(false);

  // Shuffle brands once per session for variety across visits
  const shuffledBrandsRef = useRef(shuffle([...DISCOVER_BRANDS]));
  // Absolute fetch index — brand = index % 8, page = floor(index / 8) + 1
  // This means we cycle all 8 brands on page 1, then all 8 on page 2, etc.
  const fetchIndexRef = useRef(0);

  const getBrandAndPage = (idx: number) => ({
    brand: shuffledBrandsRef.current[idx % shuffledBrandsRef.current.length],
    page: Math.floor(idx / shuffledBrandsRef.current.length) + 1,
  });

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      // Build swiped set from stored swipe docs (doc ID = styleId via setDoc)
      const snap = await getDocs(
        collection(db, "users", currentUser.uid, "swipes"),
      );
      const swiped = new Set(snap.docs.map((d) => d.id));
      setSwipedSet(swiped);

      // Fetch first 4 brands (all page 1) in parallel
      const fetches = Array.from({ length: 4 }, (_, i) => getBrandAndPage(i));
      fetchIndexRef.current = 4;

      const batches = await Promise.all(
        fetches.map(({ brand, page }) =>
          fetchRecentReleases({ brand, limit: 10, page }),
        ),
      );

      const fresh = dedupeByStyleId(shuffle(batches.flat())).filter(
        (r) => !swiped.has(r.styleId),
      );

      setInitialCards(fresh);
      setLoading(false);
      if (fresh.length === 0) setIsEmpty(true);
    })();
  }, [currentUser]);

  const handleFetchMore = useCallback(async (): Promise<SearchResult[]> => {
    const { brand, page } = getBrandAndPage(fetchIndexRef.current);
    fetchIndexRef.current += 1;
    return fetchRecentReleases({ brand, limit: 12, page });
  }, []);

  const handleSwipe = useCallback(
    async (sneaker: SearchResult, result: "like" | "pass" | "want") => {
      if (!currentUser || !userProfile) return;

      setSwipedSet((prev) => new Set([...prev, sneaker.styleId]));

      // Use styleId as doc ID for natural dedup + TradeCompose pass-signal lookup
      setDoc(doc(db, "users", currentUser.uid, "swipes", sneaker.styleId), {
        result,
        brand: sneaker.brand,
        productName: sneaker.name,
        imageUrl: sneaker.imageUrl,
        swipedAt: Timestamp.now(),
      })
        .then(async () => {
          // Only "want" (up swipe) adds to wishlist — "like" is a preference signal only
          if (result === "want" && userProfile.shoeSize) {
            const postId = await createOrUpdatePost({
              styleId: sneaker.styleId,
              title: sneaker.name,
              brand: sneaker.brand,
              productImageUrl: sneaker.imageUrl,
              userId: currentUser.uid,
              apiID: sneaker.id,
              source: sneaker.source,
            });
            await addToWishlist(
              postId,
              currentUser.uid,
              userProfile.displayName,
              userProfile.email,
              userProfile.photoURL ?? "",
              userProfile.shoeSize,
            );
          }
        })
        .catch((err) => console.error("Swipe write failed:", err));
    },
    [currentUser, userProfile],
  );

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 bg-background">
        <div
          className="w-10 h-10 rounded-full border-[3px] border-transparent animate-spin"
          style={{ borderTopColor: "#3366FF", borderRightColor: "#33FF99" }}
        />
        <p className="text-sm text-muted-foreground font-medium">
          Loading drops…
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <Navbar />

      {/* Spacer for fixed top navbar (h-14 mobile, h-16 desktop) */}
      <div className="h-14 md:h-16 flex-shrink-0" />

      {/* Header */}
      <header className="px-5 pt-3 pb-2 flex-shrink-0">
        {isOnboarding ? (
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Discover your{" "}
                <span
                  className="bg-clip-text text-transparent"
                  style={{
                    backgroundImage: "linear-gradient(90deg, #33FF99, #3366FF)",
                  }}
                >
                  taste
                </span>
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Swipe to teach Barterr what you're into
              </p>
            </div>
            <Link
              to="/dashboard"
              className="text-xs font-medium text-muted-foreground hover:text-foreground mt-1 shrink-0 ml-4 underline underline-offset-2"
            >
              Skip for now
            </Link>
          </div>
        ) : (
          <h1 className="text-2xl font-bold text-foreground">Discover</h1>
        )}
      </header>

      {/* Insight strip — sits between header and cards, not inline with title text */}
      {!isEmpty && (
        <div className="flex-shrink-0 px-5 pt-1 pb-3">
          <div className="flex items-start gap-2.5 border-l-2 border-[#3366FF]/50 pl-3">
            <Sparkles
              size={12}
              className="mt-0.5 shrink-0"
              style={{ color: "#3366FF" }}
            />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Each swipe helps your future trade partners send you better offers
              based on what you're interested in.
            </p>
          </div>
        </div>
      )}

      {/* Card area — pb-20 clears the fixed bottom tab bar (h-14) on mobile */}
      <main className="flex-1 flex flex-col items-center px-4 pb-20 md:pb-6 min-h-0">
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 px-6">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-4xl"
              style={{
                background: "linear-gradient(135deg, #33FF99, #3366FF)",
              }}
            >
              👟
            </div>
            <h2 className="text-xl font-bold text-foreground">
              You're all caught up
            </h2>
            <p className="text-muted-foreground text-sm max-w-xs leading-relaxed">
              You've seen everything — check back soon for new drops.
            </p>
            <Link
              to="/dashboard"
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-[#3366FF] hover:underline"
            >
              Back to dashboard →
            </Link>
          </div>
        ) : (
          <SwipeCardStack
            initialCards={initialCards}
            swipedSet={swipedSet}
            onSwipe={handleSwipe}
            onFetchMore={handleFetchMore}
            onEmpty={() => setIsEmpty(true)}
          />
        )}
      </main>
    </div>
  );
};

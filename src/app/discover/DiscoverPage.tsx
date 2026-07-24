import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { collection, getDocs, addDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/contexts/auth.context";
import { fetchRecentReleases } from "@/lib/api/kicksdb.service";
import { createOrUpdatePost } from "@/lib/firebase/posts.service";
import { addToWishlist } from "@/lib/firebase/posts.service";
import { SwipeCardStack } from "@/components/shared/SwipeCardStack";
import type { SearchResult } from "@/types";

export const DiscoverPage = () => {
  const { currentUser, userProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const isOnboarding = searchParams.get("onboarding") === "true";

  const [initialCards, setInitialCards] = useState<SearchResult[]>([]);
  const [swipedSet, setSwipedSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [isEmpty, setIsEmpty] = useState(false);
  const fetchOffsetRef = useRef(0);

  // Load already-swiped styleIds once on mount
  useEffect(() => {
    if (!currentUser) return;
    const loadSwipes = async () => {
      const snap = await getDocs(
        collection(db, "users", currentUser.uid, "swipes")
      );
      const ids = new Set(snap.docs.map((d) => d.id));
      setSwipedSet(ids);
      return ids;
    };

    loadSwipes().then(async (swiped) => {
      const releases = await fetchRecentReleases({ limit: 20 });
      const fresh = releases.filter((r) => !swiped.has(r.styleId));
      setInitialCards(fresh);
      setLoading(false);
      if (fresh.length === 0) setIsEmpty(true);
    });
  }, [currentUser]);

  const handleFetchMore = useCallback(async (): Promise<SearchResult[]> => {
    fetchOffsetRef.current += 20;
    // KicksDB doesn't support offset pagination cleanly — fetch fresh with a
    // slightly different daysBack window to get a different slice
    const daysBack = 90 + fetchOffsetRef.current;
    const releases = await fetchRecentReleases({ limit: 20, daysBack });
    return releases;
  }, []);

  const handleSwipe = useCallback(
    async (sneaker: SearchResult, result: "like" | "pass" | "want") => {
      if (!currentUser || !userProfile) return;

      // Add to in-memory set immediately (prevent re-show in same session)
      setSwipedSet((prev) => new Set([...prev, sneaker.styleId]));

      // Write swipe doc
      const swipeRef = collection(db, "users", currentUser.uid, "swipes");
      addDoc(swipeRef, {
        result,
        brand: sneaker.brand,
        productName: sneaker.name,
        imageUrl: sneaker.imageUrl,
        swipedAt: Timestamp.now(),
      })
        .then(async () => {
          // Wishlist on like or want
          if ((result === "like" || result === "want") && userProfile.shoeSize) {
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
              userProfile.shoeSize
            );
          }
        })
        .catch((err) => console.error("Swipe write failed:", err));
    },
    [currentUser, userProfile]
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF8]">
        <div className="w-8 h-8 border-2 border-[#3366FF] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col">
      {/* Header */}
      <header className="px-5 pt-12 pb-4">
        {isOnboarding ? (
          <div className="flex items-center justify-between mb-1">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Discover your taste</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Swipe to teach Barterr what you're into
              </p>
            </div>
            <Link
              to="/dashboard"
              className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Skip for now
            </Link>
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-bold text-foreground">New drops</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Swipe right to like · up to want · left to pass
            </p>
          </div>
        )}
      </header>

      {/* Card stack */}
      <main className="flex-1 flex flex-col items-center px-5 pb-8">
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
            <div className="text-5xl">👟</div>
            <h2 className="text-xl font-semibold text-foreground">You're all caught up</h2>
            <p className="text-muted-foreground text-sm max-w-xs">
              Check back soon — we refresh with new drops regularly.
            </p>
            <Link
              to="/dashboard"
              className="mt-2 text-sm font-semibold text-[#3366FF] hover:underline"
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

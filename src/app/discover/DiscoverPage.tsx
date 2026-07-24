import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { collection, getDocs, addDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/contexts/auth.context";
import { fetchRecentReleases } from "@/lib/api/kicksdb.service";
import { createOrUpdatePost, addToWishlist } from "@/lib/firebase/posts.service";
import { SwipeCardStack } from "@/components/shared/SwipeCardStack";
import type { SearchResult } from "@/types";

const DISCOVER_BRANDS = ["Nike", "Jordan", "Adidas", "New Balance", "Asics", "Puma", "Reebok", "Vans"];

export const DiscoverPage = () => {
  const { currentUser, userProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const isOnboarding = searchParams.get("onboarding") === "true";

  const [initialCards, setInitialCards] = useState<SearchResult[]>([]);
  const [swipedSet, setSwipedSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [isEmpty, setIsEmpty] = useState(false);
  const fetchBrandIndexRef = useRef(0);

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      const snap = await getDocs(collection(db, "users", currentUser.uid, "swipes"));
      const swiped = new Set(snap.docs.map((d) => d.id));
      setSwipedSet(swiped);

      const releases = await fetchRecentReleases({ limit: 20 });
      const fresh = releases.filter((r) => !swiped.has(r.styleId));
      setInitialCards(fresh);
      setLoading(false);
      if (fresh.length === 0) setIsEmpty(true);
    })();
  }, [currentUser]);

  const handleFetchMore = useCallback(async (): Promise<SearchResult[]> => {
    const brand = DISCOVER_BRANDS[fetchBrandIndexRef.current % DISCOVER_BRANDS.length];
    fetchBrandIndexRef.current += 1;
    return fetchRecentReleases({ brand, limit: 20 });
  }, []);

  const handleSwipe = useCallback(
    async (sneaker: SearchResult, result: "like" | "pass" | "want") => {
      if (!currentUser || !userProfile) return;

      setSwipedSet((prev) => new Set([...prev, sneaker.styleId]));

      addDoc(collection(db, "users", currentUser.uid, "swipes"), {
        result,
        brand: sneaker.brand,
        productName: sneaker.name,
        imageUrl: sneaker.imageUrl,
        swipedAt: Timestamp.now(),
      })
        .then(async () => {
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
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4"
        style={{ background: "linear-gradient(160deg, #F5F3EE 0%, #EAE8FF 55%, #DFF8F0 100%)" }}
      >
        <div
          className="w-10 h-10 rounded-full border-[3px] border-transparent animate-spin"
          style={{ borderTopColor: "#3366FF", borderRightColor: "#33FF99" }}
        />
        <p className="text-sm text-muted-foreground font-medium">Loading drops…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#FAFAF8] flex flex-col">
      {/* Header */}
      <header className="px-5 pt-10 pb-3 flex-shrink-0">
        {isOnboarding ? (
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Discover your{" "}
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: "linear-gradient(90deg, #33FF99, #3366FF)" }}
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
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              New{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(90deg, #33FF99, #3366FF)" }}
              >
                drops
              </span>
            </h1>
            <p className="text-xs text-muted-foreground mt-1 tracking-wide uppercase font-medium">
              Right = like · Up = want · Left = pass
            </p>
          </div>
        )}
      </header>

      {/* Card area */}
      <main className="flex-1 flex flex-col items-center px-4 pb-4 min-h-0">
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 px-6">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-4xl"
              style={{ background: "linear-gradient(135deg, #33FF99, #3366FF)" }}
            >
              👟
            </div>
            <h2 className="text-xl font-bold text-foreground">You're all caught up</h2>
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

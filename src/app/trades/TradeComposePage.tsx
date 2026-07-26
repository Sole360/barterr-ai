import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/contexts/auth.context";
import { useMyCollection } from "@/lib/firebase/useMyCollection";
import { fetchCurrentPrice } from "@/lib/api/kicksdb.service";
import { computeTradeLikelihood, getTradeLikelihoodLabel } from "@/lib/utils/tradeLikelihood";
import { Button } from "@/components/ui/button";
import type {
  Listing,
  Post,
  TradeReviewDraft,
  TradeReviewTheirItem,
  TradeReviewYourItem,
  TheirListingRow,
} from "@/types";
import { ArrowLeft, Check, Ruler, Shirt, Sparkles, Star } from "lucide-react";

/**
 * Helper: clamp a number between min/max.
 * Defined OUTSIDE the component so it can never be referenced before init.
 */
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

export const TradeComposePage = () => {
  // -----------------------------
  // Routing / auth / query params
  // -----------------------------
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { currentUser, userProfile } = useAuth();

  // These come from PostDetail -> Request Trade navigation
  const postId = params.get("postId") ?? "";
  const listingId = params.get("listingId") ?? "";

  // -----------------------------
  // Local state: selections + cash
  // -----------------------------
  const [selectedYourListingIds, setSelectedYourListingIds] = useState<
    string[]
  >([]);
  const [selectedTheirListingIds, setSelectedTheirListingIds] = useState<
    string[]
  >([]);
  const [addCash, setAddCash] = useState<number>(0);
  const [askCash, setAskCash] = useState<number>(0);

  // -----------------------------
  // Pricing state
  // -----------------------------
  const [fetchedPrices, setFetchedPrices] = useState<Map<string, number>>(
    new Map(),
  );
  const [pricesFetching, setPricesFetching] = useState(false);

  // -----------------------------
  // Data: my collection (left)
  // -----------------------------
  const { items: myCollectionItems, loading: myCollectionLoading } =
    useMyCollection(currentUser?.uid);

  // -----------------------------
  // Data: requested listing
  // We only need listing.userId to subscribe to their closet (right).
  // (requestedPost was unused and removed to fix strict builds)
  // -----------------------------
  const [requestedListing, setRequestedListing] = useState<Listing | null>(
    null,
  );
  const [requestedLoading, setRequestedLoading] = useState(true);

  const posterId = requestedListing?.userId ?? "";

  // -----------------------------
  // Data: their listings (right)
  // -----------------------------
  const [theirListings, setTheirListings] = useState<TheirListingRow[]>([]);
  const [theirLoading, setTheirLoading] = useState(true);

  // -----------------------------
  // Data: poster profile insights
  // -----------------------------
  const [posterProfile, setPosterProfile] = useState<{
    shoeSize?: number;
    styleTags?: string[];
    recentLikes?: { styleId: string; brand: string; productName: string; imageUrl: string }[];
    preferences?: { brands?: Record<string, number> };
  } | null>(null);
  const [posterWishlisted, setPosterWishlisted] = useState(false);
  const [posterPassedOnThis, setPosterPassedOnThis] = useState(false);

  // -----------------------------------------
  // EFFECT 1: Load requested listing doc
  // -----------------------------------------
  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!postId || !listingId) {
        if (alive) setRequestedLoading(false);
        return;
      }

      setRequestedLoading(true);

      try {
        // We intentionally do NOT fetch the post doc here anymore,
        // because it wasn't used and was failing strict builds.
        const listingSnap = await getDoc(doc(db, "listings", listingId));
        if (!alive) return;

        setRequestedListing(
          listingSnap.exists()
            ? ({
                ...(listingSnap.data() as Listing),
                id: listingSnap.id,
              } as Listing)
            : null,
        );
      } catch (e) {
        console.error("TradeCompose load requested listing error:", e);
        if (!alive) return;
        setRequestedListing(null);
      } finally {
        if (alive) setRequestedLoading(false);
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, [postId, listingId]);

  // ---------------------------------------------------
  // EFFECT 2: Always preselect the requested listing (right)
  // ---------------------------------------------------
  useEffect(() => {
    if (!listingId) return;

    setSelectedTheirListingIds((prev) => {
      if (prev.includes(listingId)) return prev;
      return [listingId, ...prev];
    });
  }, [listingId]);

  // -----------------------------------------
  // EFFECT 3: Subscribe to their listings (right)
  // -----------------------------------------
  useEffect(() => {
    if (!posterId) {
      setTheirListings([]);
      setTheirLoading(false);
      return;
    }

    setTheirLoading(true);

    const q = query(
      collection(db, "listings"),
      where("userId", "==", posterId),
      orderBy("createdAt", "desc"),
    );

    const unsub = onSnapshot(
      q,
      async (snap) => {
        const rows: TheirListingRow[] = [];

        for (const d of snap.docs) {
          const l = d.data() as Listing;

          // Load the post for display fields (title/brand/productImageUrl)
          let p: Post | null = null;
          try {
            const ps = await getDoc(doc(db, "posts", l.postId));
            if (ps.exists()) {
              p = { ...(ps.data() as Post), postId: l.postId } as Post;
            }
          } catch (e) {
            console.error("TradeCompose their listings fetch post error:", e);
          }

          rows.push({
            id: d.id,
            postId: l.postId,
            userId: l.userId,
            size: l.size,
            condition: l.condition,
            conditionGrade: l.conditionGrade,
            tradeValue: l.tradeValue,
            approvalStatus: l.approvalStatus,
            title: p?.title ?? "Unknown Sneaker",
            brand: p?.brand ?? "",
            imageUrl: p?.productImageUrl ?? "",
            apiID: l.apiID ?? p?.apiID,
            source: l.source ?? p?.source,
          });
        }

        setTheirListings(rows);
        setTheirLoading(false);
      },
      (err) => {
        console.error("TradeCompose their listings snapshot error:", err);
        setTheirListings([]);
        setTheirLoading(false);
      },
    );

    return () => unsub();
  }, [posterId]);

  // -----------------------------------------
  // EFFECT 4b: Fetch poster profile + wishlist check
  // -----------------------------------------
  useEffect(() => {
    if (!posterId || !postId) return;
    let alive = true;

    const run = async () => {
      try {
        // Fetch user profile for size + style tags
        const userSnap = await getDoc(doc(db, "users", posterId));
        if (alive && userSnap.exists()) {
          const d = userSnap.data();
          setPosterProfile({
            shoeSize: d.shoeSize,
            styleTags: d.styleTags,
            recentLikes: d.recentLikes ?? [],
            preferences: d.preferences,
          });
        }

        // Check if they've wishlisted this post (any size)
        const wishSnap = await getDocs(
          query(
            collection(db, "users", posterId, "wishlist"),
            where("postId", "==", postId),
          ),
        );
        if (alive) setPosterWishlisted(!wishSnap.empty);

        // Check if the poster has swiped "pass" on the requested sneaker
        const postSnap = await getDoc(doc(db, "posts", postId));
        const styleId: string | undefined = postSnap.exists()
          ? postSnap.data()?.styleId
          : undefined;
        if (alive && styleId) {
          const swipeRef = doc(db, "users", posterId, "swipes", styleId);
          const swipeSnap = await getDoc(swipeRef);
          if (alive)
            setPosterPassedOnThis(
              swipeSnap.exists() && swipeSnap.data()?.result === "pass",
            );
        }
      } catch {
        // non-critical — insights just won't show
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, [posterId, postId]);

  // -----------------------------------------
  // EFFECT 4: Fetch current prices for all listings
  // -----------------------------------------
  useEffect(() => {
    const allListings = [
      ...myCollectionItems.map((item) => ({
        id: item.id,
        apiID: item.apiID,
        source: item.source,
        tradeValue: Number(String(item.value).replace(/[^0-9.]/g, "")),
      })),
      ...theirListings.map((l) => ({
        id: l.id,
        apiID: l.apiID,
        source: l.source,
        tradeValue: l.tradeValue,
      })),
    ];

    const fetchPrices = async () => {
      setPricesFetching(true);
      const priceMap = new Map<string, number>();

      await Promise.all(
        allListings.map(async (listing) => {
          if (!listing.apiID || !listing.source) {
            // No API data, use tradeValue
            if (listing.tradeValue) {
              priceMap.set(listing.id, listing.tradeValue);
            }
            return;
          }

          try {
            const price = await fetchCurrentPrice(
              listing.apiID,
              listing.source,
              listing.tradeValue,
            );
            if (price !== null) {
              priceMap.set(listing.id, price);
            } else if (listing.tradeValue) {
              priceMap.set(listing.id, listing.tradeValue);
            }
          } catch (e) {
            console.error(`Error fetching price for ${listing.id}:`, e);
            if (listing.tradeValue) {
              priceMap.set(listing.id, listing.tradeValue);
            }
          }
        }),
      );

      setFetchedPrices(priceMap);
      setPricesFetching(false);
    };

    if (allListings.length > 0) {
      fetchPrices();
    }
  }, [myCollectionItems, theirListings]);

  // -----------------------------
  // Selection toggles
  // -----------------------------
  const toggleYourListing = (id: string) => {
    setSelectedYourListingIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleTheirListing = (id: string) => {
    setSelectedTheirListingIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // -----------------------------
  // Totals + net calculations
  // -----------------------------
  /**
   * Use fetched API prices when available, fallback to user-entered values.
   */
  const myValueById = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of myCollectionItems) {
      const fetchedPrice = fetchedPrices.get(item.id);
      if (fetchedPrice !== undefined) {
        m.set(item.id, fetchedPrice);
      } else {
        const n = Number(String(item.value).replace(/[^0-9.]/g, ""));
        m.set(item.id, Number.isFinite(n) ? n : 0);
      }
    }
    return m;
  }, [myCollectionItems, fetchedPrices]);

  const theirValueById = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of theirListings) {
      const fetchedPrice = fetchedPrices.get(l.id);
      if (fetchedPrice !== undefined) {
        m.set(l.id, fetchedPrice);
      } else {
        m.set(l.id, l.tradeValue ?? 0);
      }
    }
    return m;
  }, [theirListings, fetchedPrices]);

  const yourSneakerTotal = useMemo(() => {
    return selectedYourListingIds.reduce(
      (sum, id) => sum + (myValueById.get(id) ?? 0),
      0,
    );
  }, [selectedYourListingIds, myValueById]);

  const theirSneakerTotal = useMemo(() => {
    return selectedTheirListingIds.reduce(
      (sum, id) => sum + (theirValueById.get(id) ?? 0),
      0,
    );
  }, [selectedTheirListingIds, theirValueById]);

  /**
   * Net: positive => your side is offering more total value.
   * Net: negative => their side is offering more total value.
   */
  const netTotal = useMemo(() => {
    return yourSneakerTotal + addCash - askCash - theirSneakerTotal;
  }, [yourSneakerTotal, theirSneakerTotal, addCash, askCash]);

  // -----------------------------
  // Trade likelihood — composite score using market value + preference signals
  // -----------------------------
  const yourOfferedBrands = useMemo(
    () =>
      myCollectionItems
        .filter((i) => selectedYourListingIds.includes(i.id))
        .map((i) => i.brand)
        .filter((b): b is string => !!b),
    [myCollectionItems, selectedYourListingIds],
  );

  const tradeLikelihood = useMemo(() => {
    return computeTradeLikelihood({
      yourTotal: yourSneakerTotal + addCash,
      theirTotal: theirSneakerTotal + askCash,
      posterBrandPrefs: posterProfile?.preferences?.brands,
      yourOfferedBrands,
      posterWishlisted,
      requestedSize: requestedListing?.size,
      yourSize: userProfile?.shoeSize,
      posterPassedOnThis,
    });
  }, [
    yourSneakerTotal, theirSneakerTotal, addCash, askCash,
    yourOfferedBrands, posterProfile, posterWishlisted,
    requestedListing, userProfile, posterPassedOnThis,
  ]);

  // Animated likelihood — ref tracks true current value to avoid stale closure
  // when target changes mid-flight (e.g. rapid selections).
  const [animatedLikelihood, setAnimatedLikelihood] = useState<number>(0);
  const animatedLikelihoodRef = useRef<number>(0);

  useEffect(() => {
    let raf = 0;
    const start = animatedLikelihoodRef.current;
    const end = tradeLikelihood;
    const durationMs = 500;
    const startTime = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      // Cubic ease-out: fast start, smooth deceleration
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(start + (end - start) * eased);
      animatedLikelihoodRef.current = next;
      setAnimatedLikelihood(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tradeLikelihood]);

  // Label derived from real score (not animated) so description is always accurate
  const likelihoodLabel = getTradeLikelihoodLabel({
    score: tradeLikelihood,
    yourTotal: yourSneakerTotal + addCash,
    theirTotal: theirSneakerTotal + askCash,
    posterBrandPrefs: posterProfile?.preferences?.brands,
    yourOfferedBrands,
    posterWishlisted,
    requestedSize: requestedListing?.size,
    yourSize: userProfile?.shoeSize,
    posterPassedOnThis,
    posterRecentLikes: posterProfile?.recentLikes,
  });

  // Derive top brands from their collection (up to 3)
  const topBrands = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of theirListings) {
      if (l.brand) counts[l.brand] = (counts[l.brand] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([brand]) => brand);
  }, [theirListings]);

  // -----------------------------
  // Gate: must have both sides + >=50% likelihood
  // -----------------------------
  const continueDisabled =
    pricesFetching ||
    selectedYourListingIds.length === 0 ||
    selectedTheirListingIds.length === 0 ||
    tradeLikelihood < 50;

  // -----------------------------
  // Continue -> Review (no Firestore writes yet)
  // -----------------------------
  const handleContinue = () => {
    if (continueDisabled) return;

    const yourItems: TradeReviewYourItem[] = myCollectionItems
      .filter((i) => selectedYourListingIds.includes(i.id))
      .map((i) => ({
        id: i.id,
        postId: i.postId,
        name: i.name,
        size: i.size,
        value: i.value,
        imageUrl: i.imageUrl,
        brand: i.brand,
        status: i.status,
      }));

    const theirItems: TradeReviewTheirItem[] = theirListings
      .filter((l) => selectedTheirListingIds.includes(l.id))
      .map((l) => ({
        id: l.id,
        postId: l.postId,
        userId: l.userId,
        size: l.size,
        condition: l.condition,
        tradeValue: l.tradeValue,
        title: l.title,
        brand: l.brand,
        imageUrl: l.imageUrl,
      }));

    const draft: TradeReviewDraft = {
      yourItems,
      theirItems,
      addCash,
      askCash,
      netTotal,
      likelihood: tradeLikelihood,
    };

    navigate("/trades/new/review", { state: { draft } });
  };

  // -----------------------------
  // Guard: missing URL params
  // -----------------------------
  if (!postId || !listingId) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-6">
          <Button
            variant="ghost"
            className="gap-2"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          <div className="mt-4 text-sm text-muted-foreground">
            Missing trade parameters. Please start from a listing and tap
            “Request Trade”.
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------
  // Render helpers
  // -----------------------------

  // Shared horizontal-scroll card for mobile
  const MobileYourCard = ({
    item,
  }: {
    item: (typeof myCollectionItems)[0];
  }) => {
    const selected = selectedYourListingIds.includes(item.id);
    return (
      <button
        type="button"
        onClick={() => toggleYourListing(item.id)}
        className={`snap-start shrink-0 w-[112px] rounded-xl border-2 p-2 text-left transition-all ${
          selected
            ? "border-[#3366FF] bg-[#3366FF]/8"
            : "border-border bg-card hover:bg-accent"
        }`}
      >
        <div className="relative aspect-square rounded-lg bg-white overflow-hidden">
          {item.imageUrl && (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full h-full object-contain p-1"
            />
          )}
          {selected && (
            <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-[#3366FF] flex items-center justify-center shadow-sm">
              <Check className="w-3 h-3 text-white" />
            </div>
          )}
        </div>
        <div className="mt-1.5">
          <div className="text-[11px] font-semibold line-clamp-2 leading-tight">
            {item.name}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {item.size} · {item.value}
          </div>
        </div>
      </button>
    );
  };

  const MobileTheirCard = ({ l }: { l: (typeof theirListings)[0] }) => {
    const isRequested = l.id === listingId;
    const selected = selectedTheirListingIds.includes(l.id);
    return (
      <button
        type="button"
        onClick={() => toggleTheirListing(l.id)}
        className={`snap-start shrink-0 w-[112px] rounded-xl border-2 p-2 text-left transition-all ${
          selected
            ? "border-[#3366FF] bg-[#3366FF]/8"
            : "border-border bg-card hover:bg-accent"
        }`}
      >
        <div className="relative aspect-square rounded-lg bg-white overflow-hidden">
          {l.imageUrl && (
            <img
              src={l.imageUrl}
              alt={l.title}
              className="w-full h-full object-contain p-1"
            />
          )}
          {selected && (
            <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-[#3366FF] flex items-center justify-center shadow-sm">
              <Check className="w-3 h-3 text-white" />
            </div>
          )}
          {isRequested && !selected && (
            <div className="absolute top-1 left-1 rounded-full bg-[#3366FF] px-1.5 py-0.5 text-[8px] font-bold text-white leading-none">
              REQ
            </div>
          )}
        </div>
        <div className="mt-1.5">
          <div className="text-[11px] font-semibold line-clamp-2 leading-tight">
            {l.title}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Sz {l.size} · {l.condition}
          </div>
        </div>
      </button>
    );
  };

  const hasInsights =
    posterWishlisted ||
    posterPassedOnThis ||
    topBrands.length > 0 ||
    posterProfile?.shoeSize ||
    (posterProfile?.styleTags?.length ?? 0) > 0 ||
    (posterProfile?.recentLikes?.length ?? 0) > 0;

  const InsightsPanel = () => (
    <div className="w-full rounded-2xl border border-border bg-card p-4 mt-3 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        About {requestedListing?.userName?.split(" ")[0] ?? "them"}
      </div>

      {posterWishlisted && (
        <div className="flex items-center gap-2 text-sm font-semibold text-[#33C97B]">
          <Star className="w-3.5 h-3.5 fill-[#33C97B] shrink-0" />
          They have this on their wishlist
        </div>
      )}

      {posterPassedOnThis && (
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-600">
          <span className="shrink-0">⚠️</span>
          They passed on this sneaker in Discover already — they may not be
          interested in trading for it.
        </div>
      )}

      {topBrands.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Shirt className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Brand interests
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {topBrands.map((brand) => (
              <span
                key={brand}
                className="px-2.5 py-1 rounded-full bg-accent text-xs font-semibold text-foreground"
              >
                {brand}
              </span>
            ))}
          </div>
        </div>
      )}

      {posterProfile?.shoeSize && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Ruler className="w-3.5 h-3.5 shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wide">
            Shoe size
          </span>
          <span className="text-sm font-bold text-foreground">
            {posterProfile.shoeSize}
          </span>
        </div>
      )}

      {(posterProfile?.styleTags?.length ?? 0) > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Style
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {posterProfile!.styleTags!.map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-1 rounded-full border border-border text-xs font-medium text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {(posterProfile?.recentLikes?.length ?? 0) > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Star className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Recently liked in Discover
            </span>
          </div>
          {/* Horizontal scroll strip — thumbnails only, no text (sneaker names are too long for mobile) */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5 scrollbar-none">
            {posterProfile!.recentLikes!.map((item) => (
              <div
                key={item.styleId}
                className="shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-border"
                title={item.productName}
                style={{ background: "linear-gradient(135deg, #F5F3EE, #EAE8FF)" }}
              >
                <img
                  src={item.imageUrl}
                  alt={item.brand}
                  className="w-full h-full object-contain p-1"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="flex min-h-[100dvh] w-full flex-col px-4 py-4 md:mx-auto md:px-8 md:py-6">
        {/* Header */}
        <div className="relative flex w-full items-center">
          <Button
            variant="ghost"
            className="-ml-2 gap-2"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-base font-semibold md:text-lg">
            Create Trade
          </h1>
        </div>

        {/* ── Compact blue summary ── */}
        <div className="mt-3 rounded-xl border bg-[#3366FF] px-4 py-3 text-white shadow-sm">
          {/* Row 1: title + net + likelihood */}
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-semibold">Trade Summary</div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <div className="text-[10px] text-white/70 leading-none">
                  Net
                </div>
                <div className="mt-0.5 text-sm font-bold leading-none tabular-nums">
                  {netTotal >= 0 ? "+" : "-"}${Math.abs(netTotal).toFixed(0)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-white/70 leading-none">
                  Likelihood
                </div>
                <div className="mt-0.5 text-sm font-bold leading-none tabular-nums">
                  {animatedLikelihood}%
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: sliders side by side */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-white/10 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Add cash</span>
                <span className="text-xs font-bold">${addCash}</span>
              </div>
              <input
                type="range"
                min={0}
                max={500}
                step={10}
                value={addCash}
                onChange={(e) => setAddCash(Number(e.target.value))}
                className="mt-1.5 w-full accent-white"
              />
            </div>
            <div className="rounded-lg bg-white/10 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Ask cash</span>
                <span className="text-xs font-bold">${askCash}</span>
              </div>
              <input
                type="range"
                min={0}
                max={500}
                step={10}
                value={askCash}
                onChange={(e) => setAskCash(Number(e.target.value))}
                className="mt-1.5 w-full accent-white"
              />
            </div>
          </div>
        </div>

        {/* ── MOBILE layout ── */}
        <div className="md:hidden mt-4 space-y-4 pb-28">
          {/* Your Offer */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-sm font-semibold text-[#3366FF]">
                Your Offer
              </h2>
              <span className="text-xs text-muted-foreground">
                {selectedYourListingIds.length} selected
              </span>
            </div>
            {myCollectionLoading ? (
              <p className="text-sm text-muted-foreground px-1">
                Loading your collection…
              </p>
            ) : myCollectionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground px-1">
                You have no listings yet.
              </p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide">
                {myCollectionItems.map((item) => (
                  <MobileYourCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>

          {/* Compact likelihood bar */}
          <div className="space-y-1.5 px-1">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                {pricesFetching ? (
                  <div className="h-full w-1/3 animate-pulse bg-[#3366FF]/50" />
                ) : (
                  <div
                    className="h-full bg-gradient-to-r from-[#3366FF] via-[#33C9BC] to-[#33FF99]"
                    style={{ width: `${clamp(animatedLikelihood, 0, 100)}%` }}
                  />
                )}
              </div>
              <div className="shrink-0 text-right w-10">
                <div className="text-sm font-bold tabular-nums leading-none" style={{ color: likelihoodLabel.color }}>
                  {pricesFetching ? "—" : `${animatedLikelihood}%`}
                </div>
              </div>
            </div>
            {!pricesFetching && (
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] font-semibold" style={{ color: likelihoodLabel.color }}>
                  {likelihoodLabel.text}
                </span>
                <span className="text-[10px] text-muted-foreground">—</span>
                <span className="text-[10px] text-muted-foreground">{likelihoodLabel.description}</span>
              </div>
            )}
          </div>

          {/* Poster insights (mobile) */}
          {hasInsights && <InsightsPanel />}

          {/* Their Listing */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-sm font-semibold text-[#3366FF]">
                Their Listing
              </h2>
              <span className="text-xs text-muted-foreground">
                {requestedListing?.userName ?? ""}
              </span>
            </div>
            {theirLoading || requestedLoading ? (
              <p className="text-sm text-muted-foreground px-1">
                Loading their listings…
              </p>
            ) : theirListings.length === 0 ? (
              <p className="text-sm text-muted-foreground px-1">
                This user has no listings.
              </p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide">
                {theirListings.map((l) => (
                  <MobileTheirCard key={l.id} l={l} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── DESKTOP layout: 3-column grid ── */}
        <div className="hidden md:grid mt-6 flex-1 min-h-0 grid-cols-[1fr_340px_1fr] gap-6 pb-0">
          {/* LEFT: Your Offer */}
          <section className="flex min-h-0 flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-[#3366FF]">
                Your Offer
              </h2>
              <div className="text-xs text-muted-foreground">
                Selected: {selectedYourListingIds.length}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto space-y-3">
              {myCollectionLoading ? (
                <div className="text-sm text-muted-foreground">
                  Loading your collection…
                </div>
              ) : myCollectionItems.length === 0 ? (
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  You have no listings yet.
                </div>
              ) : (
                myCollectionItems.map((item) => {
                  const selected = selectedYourListingIds.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleYourListing(item.id)}
                      className={`w-full rounded-xl border p-4 text-left transition ${
                        selected
                          ? "border-[#3366FF] bg-[#3366FF]/10"
                          : "border-border hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-lg bg-muted p-2 shrink-0">
                          {item.imageUrl && (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="h-full w-full object-contain"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-lg font-semibold">
                            {item.name}
                          </div>
                          <div className="mt-0.5 text-sm text-muted-foreground">
                            {item.size} · {item.value}
                          </div>
                        </div>
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-[#3366FF]" : "border-border"}`}
                        >
                          {selected && (
                            <div className="h-3 w-3 rounded-full bg-[#3366FF]" />
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* CENTER: Likelihood Meter */}
          <section className="flex min-h-0 flex-col items-center justify-start">
            <div className="w-full rounded-2xl border border-[#3366FF]/20 bg-card p-5 text-center shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-[#3366FF]">
                Trade Likelihood
              </div>
              {pricesFetching ? (
                <div className="mt-4 space-y-2">
                  <div className="text-sm text-muted-foreground">
                    Fetching current prices...
                  </div>
                  <div className="mx-auto h-1 w-24 overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-1/2 animate-pulse bg-[#3366FF]" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-2 flex items-baseline justify-center gap-1">
                    <span className="text-5xl font-extrabold text-foreground">
                      {animatedLikelihood}
                    </span>
                    <span className="text-lg font-semibold text-muted-foreground">
                      %
                    </span>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-gradient-to-r from-[#3366FF] via-[#33C9BC] to-[#33FF99]"
                      style={{ width: `${clamp(animatedLikelihood, 0, 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 space-y-0.5">
                    <div className="text-xs font-semibold" style={{ color: likelihoodLabel.color }}>
                      {likelihoodLabel.text}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {likelihoodLabel.description}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Poster insights below likelihood meter */}
            {hasInsights && <InsightsPanel />}
          </section>

          {/* RIGHT: Their Listing */}
          <section className="flex min-h-0 flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-[#3366FF]">
                Their Listing
              </h2>
              <div className="text-xs text-muted-foreground">
                {requestedListing?.userName ?? ""}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto space-y-3">
              {theirLoading || requestedLoading ? (
                <div className="text-sm text-muted-foreground">
                  Loading their listings…
                </div>
              ) : theirListings.length === 0 ? (
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  This user has no listings.
                </div>
              ) : (
                theirListings.map((l) => {
                  const isRequested = l.id === listingId;
                  const selected = selectedTheirListingIds.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => toggleTheirListing(l.id)}
                      className={`w-full rounded-xl border p-4 text-left transition ${
                        selected
                          ? "border-[#3366FF] bg-[#3366FF]/10"
                          : "border-border hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-lg bg-muted p-2 shrink-0">
                          {l.imageUrl && (
                            <img
                              src={l.imageUrl}
                              alt={l.title}
                              className="h-full w-full object-contain"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-lg font-semibold">
                            {l.title}
                          </div>
                          <div className="mt-0.5 text-sm text-muted-foreground">
                            Sz {l.size} · {l.condition}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          {isRequested && (
                            <span className="rounded-full border border-[#3366FF] px-3 py-1 text-xs text-[#3366FF]">
                              Requested
                            </span>
                          )}
                          {selected && (
                            <span className="rounded-full bg-[#3366FF]/10 px-3 py-1 text-xs font-semibold text-[#3366FF]">
                              Selected
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </div>

        {/* Desktop action */}
        <div className="hidden md:block pt-4 mx-auto w-64">
          <Button
            className="w-full bg-[#3366FF]"
            disabled={continueDisabled}
            onClick={handleContinue}
          >
            {pricesFetching
              ? "Fetching prices…"
              : continueDisabled
                ? "Increase likelihood to 50%+"
                : "Continue"}
          </Button>
        </div>

        {/* Mobile sticky action bar */}
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
          <div className="border-t border-border bg-background/90 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
            <Button
              className="w-full bg-[#3366FF]"
              disabled={continueDisabled}
              onClick={handleContinue}
            >
              {pricesFetching
                ? "Fetching prices…"
                : continueDisabled
                  ? "Increase likelihood to 50%+"
                  : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

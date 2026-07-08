import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/contexts/auth.context";
import { useMyCollection } from "@/lib/firebase/useMyCollection";
import { fetchCurrentPrice } from "@/lib/api/kicksdb.service";
import { Button } from "@/components/ui/button";
import type {
  Listing,
  Post,
  TradeReviewDraft,
  TradeReviewTheirItem,
  TradeReviewYourItem,
  TheirListingRow,
} from "@/types";
import { ArrowLeft } from "lucide-react";

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
  const { currentUser } = useAuth();

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
    new Map()
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
    null
  );
  const [requestedLoading, setRequestedLoading] = useState(true);

  const posterId = requestedListing?.userId ?? "";

  // -----------------------------
  // Data: their listings (right)
  // -----------------------------
  const [theirListings, setTheirListings] = useState<TheirListingRow[]>([]);
  const [theirLoading, setTheirLoading] = useState(true);

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
            : null
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
      orderBy("createdAt", "desc")
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
      }
    );

    return () => unsub();
  }, [posterId]);

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
              listing.tradeValue
            );
            if (price !== null) {
              priceMap.set(listing.id, price);
            } else if (listing.tradeValue) {
              priceMap.set(listing.id, listing.tradeValue);
            }
          } catch (e) {
            console.error(
              `Error fetching price for ${listing.id}:`,
              e
            );
            if (listing.tradeValue) {
              priceMap.set(listing.id, listing.tradeValue);
            }
          }
        })
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
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleTheirListing = (id: string) => {
    setSelectedTheirListingIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
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
      0
    );
  }, [selectedYourListingIds, myValueById]);

  const theirSneakerTotal = useMemo(() => {
    return selectedTheirListingIds.reduce(
      (sum, id) => sum + (theirValueById.get(id) ?? 0),
      0
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
  // Trade likelihood (MVP formula)
  // -----------------------------
  const tradeLikelihood = useMemo(() => {
    const yourTotal = yourSneakerTotal + addCash;
    const theirTotal = theirSneakerTotal + askCash;

    const sum = yourTotal + theirTotal;

    // Legacy parity: if both sides are 0, treat as neutral
    if (sum === 0) return 50;

    // Sole360-style directional factor + baseline
    const shoeFactor = ((yourTotal - theirTotal) / sum) * 120;
    const tradePercentage = shoeFactor + 68;

    return Math.round(clamp(tradePercentage, 0, 100));
  }, [yourSneakerTotal, theirSneakerTotal, addCash, askCash]);

  // Animated likelihood number shown in the UI (counts up/down).
  const [animatedLikelihood, setAnimatedLikelihood] = useState<number>(0);

  useEffect(() => {
    let raf = 0;
    const start = animatedLikelihood;
    const end = tradeLikelihood;

    const durationMs = 220;
    const startTime = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(start + (end - start) * eased);

      setAnimatedLikelihood(next);

      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeLikelihood]);

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
  // Render
  // -----------------------------
  return (
    <div className="min-h-[100dvh] bg-white">
      {/* Use real Tailwind max width (7xl) */}
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

        {/* Sticky Trade Summary (gradient) */}
        <div className="mt-3 rounded-xl border bg-[#3366FF] p-4 text-white shadow-sm">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Trade Summary</div>
            </div>

            <div className="flex shrink-0 items-start gap-6 text-right">
              <div>
                <div className="text-xs text-white/80">Net</div>
                <div className="text-lg font-bold leading-none">
                  {netTotal >= 0 ? "+" : "-"}${Math.abs(netTotal).toFixed(0)}
                </div>
              </div>

              <div>
                <div className="text-xs text-white/80">Likelihood</div>
                <div className="text-lg font-bold leading-none">
                  {animatedLikelihood}%
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-white/10 p-3">
              <div className="text-xs text-white/80">Your sneakers</div>
              <div className="mt-0.5 text-sm font-semibold">
                ${yourSneakerTotal.toFixed(0)}
              </div>
            </div>

            <div className="rounded-lg bg-white/10 p-3">
              <div className="text-xs text-white/80">Their sneakers</div>
              <div className="mt-0.5 text-sm font-semibold">
                ${theirSneakerTotal.toFixed(0)}
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-white/10 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Add cash</div>
                <div className="text-sm font-semibold">${addCash}</div>
              </div>
              <input
                type="range"
                min={0}
                max={500}
                step={10}
                value={addCash}
                onChange={(e) => setAddCash(Number(e.target.value))}
                className="mt-2 w-full accent-white"
              />
            </div>

            <div className="rounded-lg bg-white/10 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Ask cash</div>
                <div className="text-sm font-semibold">${askCash}</div>
              </div>
              <input
                type="range"
                min={0}
                max={500}
                step={10}
                value={askCash}
                onChange={(e) => setAskCash(Number(e.target.value))}
                className="mt-2 w-full accent-white"
              />
            </div>
          </div>
        </div>

        {/* Content: stack on mobile, 3 columns on desktop */}
        <div className="mt-4 grid flex-1 min-h-0 grid-cols-1 gap-4 pb-28 md:mt-6 md:grid-cols-[1fr_340px_1fr] md:gap-6 md:pb-0">
          {/* LEFT: Your Offer */}
          <section className="flex min-h-0 flex-col gap-3 rounded-xl border border-gray-200 p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-[#3366FF]">
                Your Offer
              </h2>
              <div className="text-xs text-muted-foreground">
                Selected: {selectedYourListingIds.length}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              {myCollectionLoading ? (
                <div className="text-sm text-muted-foreground">
                  Loading your collection…
                </div>
              ) : myCollectionItems.length === 0 ? (
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  You have no listings yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {myCollectionItems.map((item) => {
                    const selected = selectedYourListingIds.includes(item.id);

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleYourListing(item.id)}
                        className={`w-full rounded-xl border p-3 text-left transition md:p-4 ${
                          selected
                            ? "border-[#3366FF] bg-[#3366FF]/10"
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          {/* BIGGER IMAGE */}
                          <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-lg bg-gray-100 p-2 md:h-32 md:w-32">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="h-full w-full object-contain"
                              />
                            ) : null}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                {/* Prefer 2-line readability over tiny truncation */}
                                <div className="line-clamp-2 text-base font-semibold md:text-lg">
                                  {item.name}
                                </div>
                                <div className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                                  {item.size} • {item.value}
                                </div>
                              </div>

                              {selected ? (
                                <span className="shrink-0 rounded-full bg-[#3366FF]/10 px-3 py-1 text-xs font-semibold text-[#3366FF]">
                                  Selected
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                              selected ? "border-[#3366FF]" : "border-gray-300"
                            }`}
                          >
                            {selected ? (
                              <div className="h-3 w-3 rounded-full bg-[#3366FF]" />
                            ) : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
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
                  <div className="mx-auto h-1 w-24 overflow-hidden rounded-full bg-gray-200">
                    <div className="h-full w-1/2 animate-pulse bg-[#3366FF]" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-2 flex items-baseline justify-center gap-1">
                    <span className="text-5xl font-extrabold text-[#111]">
                      {animatedLikelihood}
                    </span>
                    <span className="text-lg font-semibold text-muted-foreground">
                      %
                    </span>
                  </div>

                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full bg-gradient-to-r from-[#3366FF] via-[#33C9BC] to-[#33FF99] transition-[width] duration-200"
                      style={{ width: `${clamp(animatedLikelihood, 0, 100)}%` }}
                    />
                  </div>

                  <div className="mt-2 text-xs text-muted-foreground">
                    Aim for{" "}
                    <span className="font-semibold text-[#3366FF]">50%+</span> to
                    continue.
                  </div>
                </>
              )}
            </div>
          </section>

          {/* RIGHT: Their Listing */}
          <section className="flex min-h-0 flex-col gap-3 rounded-xl border border-gray-200 p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-[#3366FF]">
                Their Listing
              </h2>
              <div className="text-xs text-muted-foreground">
                {requestedListing?.userName ?? ""}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              {theirLoading || requestedLoading ? (
                <div className="text-sm text-muted-foreground">
                  Loading their listings…
                </div>
              ) : theirListings.length === 0 ? (
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  This user has no listings.
                </div>
              ) : (
                <div className="space-y-3">
                  {theirListings.map((l) => {
                    const isRequested = l.id === listingId;
                    const selected = selectedTheirListingIds.includes(l.id);

                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => toggleTheirListing(l.id)}
                        className={`w-full rounded-xl border p-3 text-left transition md:p-4 ${
                          selected
                            ? "border-[#3366FF] bg-[#3366FF]/10"
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          {/* BIGGER IMAGE */}
                          <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-lg bg-gray-100 p-2 md:h-32 md:w-32">
                            {l.imageUrl ? (
                              <img
                                src={l.imageUrl}
                                alt={l.title}
                                className="h-full w-full object-contain"
                              />
                            ) : null}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="line-clamp-2 text-base font-semibold md:text-lg">
                              {l.title}
                            </div>
                            <div className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                              Size {l.size} • {l.condition}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            {isRequested ? (
                              <span className="rounded-full border border-[#3366FF] px-3 py-1 text-xs text-[#3366FF]">
                                Requested
                              </span>
                            ) : null}

                            {selected ? (
                              <span className="rounded-full bg-[#3366FF]/10 px-3 py-1 text-xs font-semibold text-[#3366FF]">
                                Selected
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
        {/* Desktop action */}
        <div className="hidden pt-2 md:block mx-auto w-64">
          <Button
            className="w-full bg-[#3366FF]"
            disabled={continueDisabled}
            onClick={handleContinue}
          >
            {pricesFetching
              ? "Fetching prices..."
              : continueDisabled
              ? "Increase likelihood to 50%+"
              : "Continue"}
          </Button>
        </div>

        {/* Mobile sticky action bar */}
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
          <div className="border-t border-border bg-background/90 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
            <div className="mx-auto w-full max-w-7xl">
              <Button
                className="w-full bg-[#3366FF]"
                variant="outline"
                disabled={continueDisabled}
                onClick={handleContinue}
              >
                {pricesFetching
                  ? "Fetching prices..."
                  : continueDisabled
                  ? "Increase likelihood to 50%+"
                  : "Continue"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

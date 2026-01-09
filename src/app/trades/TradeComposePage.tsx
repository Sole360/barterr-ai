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
import { Button } from "@/components/ui/button";

import type { Listing, Post } from "@/types";
import { ArrowLeft } from "lucide-react";

type TheirListingRow = {
  id: string;
  postId: string;
  userId: string;
  size: number;
  condition: "new" | "used";
  conditionGrade: number;
  tradeValue: number;
  approvalStatus?: "approved" | "pending" | "rejected";
  title: string;
  brand: string;
  imageUrl: string;
};

export const TradeComposePage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { currentUser } = useAuth();

  const postId = params.get("postId") ?? "";
  const listingId = params.get("listingId") ?? "";

  const { items: myCollectionItems, loading: myCollectionLoading } =
    useMyCollection(currentUser?.uid);

  const [theirListings, setTheirListings] = useState<TheirListingRow[]>([]);
  const [theirLoading, setTheirLoading] = useState(true);

  const [requestedPost, setRequestedPost] = useState<Post | null>(null);
  const [requestedListing, setRequestedListing] = useState<Listing | null>(
    null
  );
  const [requestedLoading, setRequestedLoading] = useState(true);

  const [selectedYourListingIds, setSelectedYourListingIds] = useState<
    string[]
  >([]);

  const posterId = requestedListing?.userId ?? "";

  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!postId || !listingId) {
        if (alive) setRequestedLoading(false);
        return;
      }

      setRequestedLoading(true);

      try {
        const [postSnap, listingSnap] = await Promise.all([
          getDoc(doc(db, "posts", postId)),
          getDoc(doc(db, "listings", listingId)),
        ]);

        if (!alive) return;

        setRequestedPost(
          postSnap.exists()
            ? ({ ...(postSnap.data() as Post), postId: postSnap.id } as Post)
            : null
        );

        setRequestedListing(
          listingSnap.exists()
            ? ({
                ...(listingSnap.data() as Listing),
                id: listingSnap.id,
              } as Listing)
            : null
        );
      } catch (e) {
        console.error("TradeCompose load requested listing/post error:", e);
        if (!alive) return;
        setRequestedPost(null);
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

  const requestedTheirLabel = useMemo(() => {
    if (!requestedPost || !requestedListing) return "";
    const size = requestedListing.size ? `US ${requestedListing.size}` : "";
    return `${requestedPost.title} • ${size}`;
  }, [requestedPost, requestedListing]);

  const toggleYourListing = (id: string) => {
    setSelectedYourListingIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const sendDisabled = selectedYourListingIds.length === 0;

  if (!postId || !listingId) {
    return (
      <div className="min-h-[100dvh] bg-white">
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

  return (
    <div className="min-h-[100dvh] bg-white">
      <div className="flex min-h-[100dvh] w-full flex-col px-4 py-4 md:mx-auto md:max-w-6xl md:px-6 md:py-6">
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

        {/* Requested */}
        <div className="mt-3 rounded-xl border border-[#3366FF]/30 bg-[#3366FF]/5 p-4">
          <div className="text-xs text-muted-foreground">Requested listing</div>
          <div className="mt-1 text-sm font-semibold">
            {requestedLoading ? "Loading…" : requestedTheirLabel || "Not found"}
          </div>
        </div>

        {/* Content */}
        <div className="mt-4 grid flex-1 min-h-0 gap-4 pb-28 md:mt-6 md:grid-cols-2 md:gap-6 md:pb-0">
          {/* LEFT */}
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
                          {/* Image */}
                          <div className="flex h-20 w-24 items-center justify-center overflow-hidden rounded-md bg-gray-100 p-2 sm:h-24 sm:w-28">
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
                                <div className="truncate text-base font-semibold md:text-lg">
                                  {item.name}
                                </div>
                                <div className="mt-0.5 text-sm text-muted-foreground">
                                  {item.size} • {item.value}
                                </div>
                              </div>

                              {/* Selected pill */}
                              {selected ? (
                                <span className="shrink-0 rounded-full bg-[#3366FF]/10 px-3 py-1 text-xs font-semibold text-[#3366FF]">
                                  Selected
                                </span>
                              ) : null}
                            </div>
                          </div>

                          {/* Keep the dot indicator too */}
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

          {/* RIGHT */}
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

                    return (
                      <div
                        key={l.id}
                        className={`rounded-xl border p-3 md:p-4 ${
                          isRequested
                            ? "border-[#3366FF] bg-[#3366FF]/10"
                            : "border-gray-200"
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex h-20 w-24 items-center justify-center overflow-hidden rounded-md bg-gray-100 p-2 sm:h-24 sm:w-28">
                            {l.imageUrl ? (
                              <img
                                src={l.imageUrl}
                                alt={l.title}
                                className="h-full w-full object-contain"
                              />
                            ) : null}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="truncate text-base font-semibold md:text-lg">
                              {l.title}
                            </div>
                            <div className="mt-0.5 text-sm text-muted-foreground">
                              Size {l.size} • {l.condition}
                            </div>
                          </div>

                          {isRequested ? (
                            <div className="shrink-0 rounded-full border border-[#3366FF] px-3 py-1 text-xs text-[#3366FF]">
                              Requested
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Desktop action */}
            <div className="hidden pt-2 md:block">
              <Button
                className="w-full border-[#3366FF]/40 text-[#3366FF]"
                variant="outline"
                disabled={sendDisabled}
              >
                {sendDisabled
                  ? "Select at least 1 sneaker"
                  : "Send Trade (next step)"}
              </Button>
            </div>
          </section>
        </div>

        {/* Mobile sticky action bar */}
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
          <div className="border-t border-gray-200 bg-white/90 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
            <div className="mx-auto w-full max-w-6xl">
              <Button
                className="w-full border-[#3366FF]/40 text-[#3366FF]"
                variant="outline"
                disabled={sendDisabled}
              >
                {sendDisabled
                  ? "Select at least 1 sneaker"
                  : "Send Trade (next step)"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

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
  // display helpers (from post)
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

  // selection
  const [selectedYourListingIds, setSelectedYourListingIds] = useState<
    string[]
  >([]);

  const posterId = requestedListing?.userId ?? "";

  // Load the requested post + requested listing (the sneaker you tapped "Request Trade" on)
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

  // Subscribe to THEIR collection (listings by posterId)
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

        // We fetch each listing's post doc for title/image
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

  // Basic guards
  if (!postId || !listingId) {
    return (
      <div className="min-h-screen bg-white">
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
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            className="gap-2"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          <h1 className="text-lg font-semibold">Create Trade</h1>
          <div className="w-16" />
        </div>

        {/* Requested listing summary */}
        <div className="mt-4 rounded-xl border border-[#3366FF]/30 bg-[#3366FF]/5 p-4">
          <div className="text-xs text-muted-foreground">Requested listing</div>
          <div className="mt-1 text-sm font-semibold">
            {requestedLoading ? "Loading…" : requestedTheirLabel || "Not found"}
          </div>
        </div>

        {/* Split screen */}
        <div className="mt-6 grid flex-1 gap-6 md:grid-cols-2">
          {/* LEFT: Your offer */}
          <section className="flex h-full flex-col gap-3 rounded-xl border border-gray-200 p-4">
            <div className="flex-1 overflow-auto space-y-2">
              <h2 className="text-sm font-semibold text-[#3366FF]">
                Your Offer
              </h2>
              <div className="text-xs text-muted-foreground">
                Selected: {selectedYourListingIds.length}
              </div>
            </div>

            {myCollectionLoading ? (
              <div className="text-sm text-muted-foreground">
                Loading your collection…
              </div>
            ) : myCollectionItems.length === 0 ? (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                Your collection is empty. Add sneakers to your collection before
                sending trades.
              </div>
            ) : (
              <div className="space-y-2">
                {myCollectionItems.map((item) => {
                  const selected = selectedYourListingIds.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleYourListing(item.id)}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${
                        selected
                          ? "border-[#3366FF] bg-[#3366FF]/5"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={item.imageUrl ?? ""}
                          alt={item.name}
                          className="h-12 w-12 rounded object-cover bg-gray-100"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {item.name}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {item.brand ? `${item.brand} • ` : ""}
                            {item.size} • {item.value}
                            {item.status ? ` • ${item.status}` : ""}
                          </div>
                        </div>

                        <div
                          className={`h-5 w-5 rounded-full border flex items-center justify-center ${
                            selected
                              ? "border-[#3366FF] bg-[#3366FF]/10 shadow-sm"
                              : "border-gray-200 hover:border-[#3366FF]/40"
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
          </section>

          {/* RIGHT: Their offer / their closet */}
          <section className="flex h-full flex-col gap-3 rounded-xl border border-gray-200 p-4">
            <div className="flex-1 overflow-auto space-y-2">
              <h2 className="text-sm font-semibold text-[#3366FF]">
                Their Listing
              </h2>
              <div className="text-xs text-muted-foreground">
                {requestedListing?.userName ?? ""}
              </div>
            </div>

            {theirLoading || requestedLoading ? (
              <div className="text-sm text-muted-foreground">
                Loading their listings…
              </div>
            ) : theirListings.length === 0 ? (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                This user has no listings.
              </div>
            ) : (
              <div className="space-y-2">
                {theirListings.map((l) => {
                  const isRequested = l.id === listingId;
                  return (
                    <div
                      key={l.id}
                      className={`rounded-lg border p-3 ${
                        isRequested
                          ? "border-[#3366FF] bg-[#3366FF]/5"
                          : "border-gray-200"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={l.imageUrl}
                          alt={l.title}
                          className="h-12 w-12 rounded object-cover bg-gray-100"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {l.title}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {l.brand ? `${l.brand} • ` : ""}
                            US {l.size} • ${l.tradeValue} •{" "}
                            {l.condition === "new"
                              ? "Deadstock"
                              : `${l.conditionGrade}/10`}
                            {l.approvalStatus ? ` • ${l.approvalStatus}` : ""}
                          </div>
                        </div>

                        {isRequested ? (
                          <div className="shrink-0 rounded-full border border-[#3366FF] px-2 py-1 text-xs text-[#3366FF]">
                            Requested
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* bottom action placeholder (no sending yet) */}
            <div className="pt-2">
              <Button className="w-full" variant="outline" disabled>
                Send Trade (next step)
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

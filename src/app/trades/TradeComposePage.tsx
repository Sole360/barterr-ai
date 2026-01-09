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
  productImageUrl: string;
};

export const TradeComposePage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { currentUser } = useAuth();

  const postId = params.get("postId") ?? "";
  const listingId = params.get("listingId") ?? "";
  const posterId = params.get("posterId") ?? "";

  const [requestedPost, setRequestedPost] = useState<Post | null>(null);
  const [requestedListing, setRequestedListing] = useState<Listing | null>(
    null
  );
  const [requestedLoading, setRequestedLoading] = useState(true);

  const [theirListings, setTheirListings] = useState<TheirListingRow[]>([]);
  const [theirLoading, setTheirLoading] = useState(true);

  const [selectedYourListingIds, setSelectedYourListingIds] = useState<
    string[]
  >([]);

  const { items: myCollectionItems, loading: myCollectionLoading } =
    useMyCollection(currentUser?.uid ?? "");

  const effectivePosterId = posterId || requestedListing?.userId || "";

  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!postId || !listingId) {
        setRequestedPost(null);
        setRequestedListing(null);
        setRequestedLoading(false);
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
    if (!effectivePosterId) {
      setTheirListings([]);
      setTheirLoading(false);
      return;
    }

    setTheirLoading(true);

    const q = query(
      collection(db, "listings"),
      where("userId", "==", effectivePosterId),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, async (snap) => {
      try {
        const rows: TheirListingRow[] = await Promise.all(
          snap.docs.map(async (d) => {
            const data = d.data() as Listing;
            const postSnap = await getDoc(doc(db, "posts", data.postId));
            const postData = postSnap.exists()
              ? (postSnap.data() as Post)
              : null;

            return {
              id: d.id,
              postId: data.postId,
              userId: data.userId,
              size: data.size,
              condition: data.condition,
              conditionGrade: data.conditionGrade,
              tradeValue: data.tradeValue,
              approvalStatus: data.approvalStatus,
              title: postData?.title ?? "",
              brand: postData?.brand ?? "",
              productImageUrl: postData?.productImageUrl ?? "",
            };
          })
        );

        setTheirListings(rows);
      } finally {
        setTheirLoading(false);
      }
    });

    return () => unsub();
  }, [effectivePosterId]);

  const requestedTheirLabel = useMemo(() => {
    if (!requestedPost || !requestedListing) return "";
    return `${requestedPost.title} • Size ${requestedListing.size}`;
  }, [requestedPost, requestedListing]);

  const toggleYourListing = (id: string) => {
    setSelectedYourListingIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            className="-ml-2 h-9 px-2"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          <h1 className="text-lg font-semibold">Create Trade</h1>
          <div className="w-16" />
        </div>

        {/* Requested */}
        <div className="mt-4 rounded-xl border border-[#3366FF]/30 bg-[#3366FF]/5 p-4">
          <div className="text-xs text-muted-foreground">Requested listing</div>
          <div className="mt-1 text-sm font-semibold">
            {requestedLoading ? "Loading…" : requestedTheirLabel}
          </div>
        </div>

        <div className="mt-6 grid flex-1 min-h-0 gap-6 md:grid-cols-2">
          {/* Your Offer */}
          <section className="flex min-h-0 flex-col gap-3 rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-[#3366FF]">
              Your Offer ({selectedYourListingIds.length})
            </h2>

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
                      onClick={() => toggleYourListing(item.id)}
                      className={`w-full rounded-lg border p-4 text-left transition ${
                        selected
                          ? "border-[#3366FF] bg-[#3366FF]/5"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        {/* IMAGE: contain (no crop) */}
                        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md bg-gray-100 p-2 sm:h-24 sm:w-24">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="h-full w-full object-contain"
                            />
                          ) : null}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="truncate text-base font-semibold">
                            {item.name}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {item.size} • {item.value}
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
                })
              )}
            </div>
          </section>

          {/* Their Listing */}
          <section className="flex min-h-0 flex-col gap-3 rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-[#3366FF]">
              Their Listing
            </h2>

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

                  return (
                    <div
                      key={l.id}
                      className={`rounded-lg border p-4 ${
                        isRequested
                          ? "border-[#3366FF] bg-[#3366FF]/5"
                          : "border-gray-200"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        {/* IMAGE: contain (no crop) */}
                        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md bg-gray-100 p-2 sm:h-24 sm:w-24">
                          {l.productImageUrl ? (
                            <img
                              src={l.productImageUrl}
                              alt={l.title}
                              className="h-full w-full object-contain"
                            />
                          ) : null}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="truncate text-base font-semibold">
                            {l.title}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Size {l.size} • {l.condition}
                          </div>
                        </div>

                        {isRequested ? (
                          <span className="rounded-full border border-[#3366FF] px-3 py-1 text-xs text-[#3366FF]">
                            Requested
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <Button
              variant="outline"
              disabled
              className="mt-2 w-full border-[#3366FF]/40 text-[#3366FF]"
            >
              Send Trade (next step)
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
};

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import type { Listing } from "@/types";

export type MyCollectionItem = {
  id: string; // listingId
  postId: string;
  name: string;
  size: string;
  value: string;
  imageUrl?: string;
  brand?: string;
  status?: "approved" | "pending" | "rejected";
};

export function useMyCollection(userId?: string) {
  const [items, setItems] = useState<MyCollectionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, "listings"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const results: MyCollectionItem[] = snap.docs.map((docSnap) => {
        const listing = docSnap.data() as Listing;

        return {
          id: docSnap.id,
          postId: listing.postId,
          name: listing.productName ?? "Unknown Sneaker",
          imageUrl: listing.productImageUrl,
          brand: listing.brand,
          size: `US ${listing.size}`,
          value: `$${listing.tradeValue}`,
          status: listing.approvalStatus,
        };
      });

      setItems(results);
      setLoading(false);
    });

    return unsub;
  }, [userId]);

  return { items, loading };
}

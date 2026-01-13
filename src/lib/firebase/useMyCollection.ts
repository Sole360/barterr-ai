import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  getDoc,
  doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import type { Listing, Post, MyCollectionItem } from "@/types";

export const useMyCollection = (userId?: string) => {
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

    const unsub = onSnapshot(q, async (snap) => {
      const results: MyCollectionItem[] = [];

      for (const docSnap of snap.docs) {
        const listing = docSnap.data() as Listing;

        let post: Post | null = null;
        try {
          const postSnap = await getDoc(doc(db, "posts", listing.postId));
          if (postSnap.exists()) {
            post = { ...(postSnap.data() as Post), postId: listing.postId };
          }
        } catch (e) {
          console.warn(`Failed to load post: ${e} `, listing.postId);
        }

        results.push({
          id: docSnap.id,
          postId: listing.postId,
          name: post?.title ?? "Unknown Sneaker",
          imageUrl: post?.productImageUrl,
          brand: post?.brand,
          size: `US ${listing.size}`,
          value: `$${listing.tradeValue}`,
          status: listing.approvalStatus,
        });
      }

      setItems(results);
      setLoading(false);
    });

    return unsub;
  }, [userId]);

  return { items, loading };
};

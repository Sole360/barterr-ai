import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Listing, Post } from "@/types";

export type MyCollectionItem = {
  id: string;
  postId: string;
  post?: Post;
  name: string;
  size: string;
  value: string;
  imageUrl?: string;
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

    const q = query(
      collection(db, "listings"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, async (snap) => {
      const results: MyCollectionItem[] = [];

      for (const docSnap of snap.docs) {
        const listing = docSnap.data() as Listing;

        let post: Post | undefined;
        try {
          const postSnap = await getDoc(doc(db, "posts", listing.postId));
          if (postSnap.exists()) {
            post = { ...(postSnap.data() as Post), postId: listing.postId };
          }
        } catch (err) {
          console.warn("useMyCollection: failed to fetch post", {
            postId: listing.postId,
            listingId: docSnap.id,
            err,
          });
        }

        results.push({
          id: docSnap.id,
          postId: listing.postId,
          post,
          name: post?.title ?? "Unknown Sneaker",
          imageUrl: post?.productImageUrl,
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
}

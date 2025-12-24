import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import type { Post } from "@/types";

export type MyWishlistItem = {
  id: string; // `${postId}_${size}`
  postId: string;
  name: string;
  brand?: string;
  imageUrl?: string;
  size: number;
  addedAt?: Timestamp;
};

export const useMyWishlist = (userId?: string) => {
  const [items, setItems] = useState<MyWishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, "users", userId, "wishlist"),
      orderBy("addedAt", "desc")
    );

    const unsub = onSnapshot(q, async (snap) => {
      const results: MyWishlistItem[] = [];

      for (const docSnap of snap.docs) {
        const wl = docSnap.data() as {
          postId: string;
          size: number;
          addedAt?: Timestamp;
        };

        if (!wl.postId || wl.size == null) continue;

        let post: Post | null = null;
        try {
          const postSnap = await getDoc(doc(db, "posts", wl.postId));
          if (postSnap.exists()) {
            post = { ...(postSnap.data() as Post), postId: wl.postId };
          }
        } catch (err) {
          console.warn("useMyWishlist: failed to fetch post", {
            postId: wl.postId,
            err,
          });
        }

        results.push({
          id: `${wl.postId}_${wl.size}`,
          postId: wl.postId,
          name: post?.title ?? "Unknown Sneaker",
          brand: post?.brand,
          imageUrl: post?.productImageUrl,
          size: wl.size,
          addedAt: wl.addedAt,
        });
      }

      setItems(results);
      setLoading(false);
    });

    return unsub;
  }, [userId]);

  return { items, loading };
};

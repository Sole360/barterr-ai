import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";

const ALPHA = 0.3;

const SIGNAL: Record<string, number> = {
  want: 1.0,
  like: 0.8,
  pass: 0.0,
};

const MAX_RECENT_LIKES = 5;

interface RecentLike {
  styleId: string;
  brand: string;
  productName: string;
  imageUrl: string;
}

/**
 * Fires when a swipe doc is created at users/{userId}/swipes/{styleId}.
 * 1. Updates preferences.brands EMA (all swipes).
 * 2. Updates recentLikes array on user doc (like + want only, capped at 5).
 *    recentLikes is on the public user doc so TradeCompose can read it without
 *    needing to query the private swipes subcollection.
 */
export const onSwipeCreated = onDocumentCreated(
  "users/{userId}/swipes/{styleId}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return null;

    const { result, brand, productName, imageUrl } = data as {
      result: string;
      brand: string;
      productName?: string;
      imageUrl?: string;
    };
    const signal = SIGNAL[result];
    if (signal === undefined || !brand) return null;

    const uid = event.params.userId;
    const styleId = event.params.styleId;
    const db = getFirestore();
    const userRef = db.collection("users").doc(uid);

    try {
      const snap = await userRef.get();
      const userData = snap.data() ?? {};

      // 1. EMA brand preference update
      const brands: Record<string, number> = userData.preferences?.brands ?? {};
      const current = brands[brand] ?? 0.5;
      const updatedWeight = ALPHA * signal + (1 - ALPHA) * current;

      const update: Record<string, unknown> = {
        [`preferences.brands.${brand}`]: updatedWeight,
      };

      // 2. recentLikes — only for like and want (not pass)
      if (result === "like" || result === "want") {
        const currentLikes: RecentLike[] = userData.recentLikes ?? [];
        const newEntry: RecentLike = {
          styleId,
          brand,
          productName: productName ?? "",
          imageUrl: imageUrl ?? "",
        };
        // Prepend, deduplicate by styleId, cap at MAX_RECENT_LIKES
        const updatedLikes = [
          newEntry,
          ...currentLikes.filter((l) => l.styleId !== styleId),
        ].slice(0, MAX_RECENT_LIKES);

        update.recentLikes = updatedLikes;
      }

      await userRef.update(update);

      logger.info(
        `preferenceEngine: uid=${uid} brand=${brand} ${result} ` +
          `${current.toFixed(3)} → ${updatedWeight.toFixed(3)}`
      );
    } catch (err) {
      logger.error(`preferenceEngine: uid=${uid} failed:`, err);
    }

    return null;
  }
);

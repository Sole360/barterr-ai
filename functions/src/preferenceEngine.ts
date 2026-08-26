import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import { triggerRecommendationRefresh } from "./recommendationEngine";

// Differentiated learning rates — negative/weak signals update more slowly
const ALPHA: Record<string, number> = {
  trade_accepted: 0.40,
  want:           0.35,
  like:           0.25,
  pass:           0.15,
  trade_declined: 0.15,
};

// All signals in [0, 1]; values < 0.5 pull the EMA weight downward
const SIGNAL: Record<string, number> = {
  trade_accepted: 0.95,
  want:           0.85,
  like:           0.70,
  pass:           0.25,   // was 0.0 — mild negative, not trending to zero
  trade_declined: 0.20,
};

const MAX_RECENT_LIKES = 5;

interface RecentLike {
  styleId: string;
  brand: string;
  productName: string;
  imageUrl: string;
}

/**
 * Shared EMA update helper used by both the swipe trigger and the trade signal trigger.
 * Updates preferences.brands[brand] and preferences.sneakers[styleId] in a single write.
 *
 * Brand is the aggregate/fallback signal; styleId is the specific model signal.
 * Both are updated on every signal event — sneaker-level is weighted more heavily
 * in recommendation scoring.
 */
export async function updatePreference(
  uid: string,
  signalType: string,
  params: { brand: string; styleId: string }
): Promise<void> {
  const { brand, styleId } = params;
  const signal = SIGNAL[signalType];
  const alpha = ALPHA[signalType];

  if (signal === undefined || alpha === undefined || !brand || !styleId) return;

  const db = getFirestore();
  const userRef = db.collection("users").doc(uid);

  try {
    const snap = await userRef.get();
    const userData = snap.data() ?? {};

    const brands: Record<string, number> = userData.preferences?.brands ?? {};
    const sneakers: Record<string, number> = userData.preferences?.sneakers ?? {};

    const currentBrand = brands[brand] ?? 0.5;
    const currentSneaker = sneakers[styleId] ?? 0.5;

    const updatedBrand = alpha * signal + (1 - alpha) * currentBrand;
    const updatedSneaker = alpha * signal + (1 - alpha) * currentSneaker;

    await userRef.update({
      [`preferences.brands.${brand}`]: updatedBrand,
      [`preferences.sneakers.${styleId}`]: updatedSneaker,
    });

    logger.info(
      `preferenceEngine: uid=${uid} signal=${signalType} ` +
      `brand=${brand} ${currentBrand.toFixed(3)}→${updatedBrand.toFixed(3)} | ` +
      `sneaker=${styleId} ${currentSneaker.toFixed(3)}→${updatedSneaker.toFixed(3)}`
    );
  } catch (err) {
    logger.error(`preferenceEngine: uid=${uid} updatePreference failed:`, err);
  }
}

/**
 * Fires when a swipe doc is created at users/{userId}/swipes/{styleId}.
 * 1. Updates preferences.brands and preferences.sneakers via EMA.
 * 2. Updates recentLikes array (like + want only, capped at 5).
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

    if (!SIGNAL[result]) return null;

    const uid = event.params.userId;
    const styleId = event.params.styleId;

    // Update both preference levels
    await updatePreference(uid, result, { brand, styleId });

    // Update recentLikes for like + want only
    if (result === "like" || result === "want") {
      try {
        const db = getFirestore();
        const userRef = db.collection("users").doc(uid);
        const snap = await userRef.get();
        const currentLikes: RecentLike[] = snap.data()?.recentLikes ?? [];

        const newEntry: RecentLike = {
          styleId,
          brand,
          productName: productName ?? "",
          imageUrl: imageUrl ?? "",
        };

        const updatedLikes = [
          newEntry,
          ...currentLikes.filter((l) => l.styleId !== styleId),
        ].slice(0, MAX_RECENT_LIKES);

        await userRef.update({ recentLikes: updatedLikes });
      } catch (err) {
        logger.error(`preferenceEngine: uid=${uid} recentLikes update failed:`, err);
      }
    }

    return null;
  }
);

/**
 * Fires when a user adds a sneaker to their wishlist.
 * Wishlisting is a high-intent signal — the user named a specific shoe AND size.
 * Applies a "want" signal (same strength as an explicit swipe Want) for the post's
 * brand and styleId, then chains a recommendation refresh.
 */
export const onWishlistCreated = onDocumentCreated(
  {
    document: "users/{userId}/wishlist/{wishlistId}",
    region: "us-central1",
    secrets: ["ALGOLIA_APP_ID", "ALGOLIA_ADMIN_API_KEY"],
  },
  async (event) => {
    const data = event.data?.data();
    if (!data?.postId) return null;

    const uid = event.params.userId;
    const postId = data.postId as string;

    const db = getFirestore();
    const postSnap = await db.doc(`posts/${postId}`).get();
    const post = postSnap.data();

    const brand = post?.brand as string | undefined;
    const styleId = post?.styleId as string | undefined;

    if (!brand || !styleId) {
      logger.warn(`onWishlistCreated: post ${postId} missing brand or styleId, skipping signal`);
      return null;
    }

    await updatePreference(uid, "want", { brand, styleId });
    await triggerRecommendationRefresh(uid).catch((err) =>
      logger.error("onWishlistCreated: recommendation refresh failed:", err)
    );

    logger.info(`onWishlistCreated: want signal applied for uid=${uid} brand=${brand} styleId=${styleId}`);
    return null;
  }
);

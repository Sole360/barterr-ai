import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";

const ALPHA = 0.3; // EMA learning rate — recent swipes weight more

const SIGNAL: Record<string, number> = {
  want: 1.0,
  like: 0.8,
  pass: 0.0,
};

/**
 * When a swipe doc is created at users/{userId}/swipes/{styleId},
 * update the user's preferences.brands map using an EMA so recent
 * signals carry more weight without overwriting the full history.
 */
export const onSwipeCreated = onDocumentCreated(
  "users/{userId}/swipes/{styleId}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return null;

    const { result, brand } = data as { result: string; brand: string };
    const signal = SIGNAL[result];
    if (signal === undefined || !brand) return null;

    const uid = event.params.userId;
    const db = getFirestore();
    const userRef = db.collection("users").doc(uid);

    try {
      const snap = await userRef.get();
      const prefs = snap.data()?.preferences ?? {};
      const brands: Record<string, number> = prefs.brands ?? {};
      const current = brands[brand] ?? 0.5; // neutral default
      const updated = ALPHA * signal + (1 - ALPHA) * current;

      await userRef.update({
        [`preferences.brands.${brand}`]: updated,
      });

      logger.info(
        `preferenceEngine: uid=${uid} brand=${brand} ${result} ` +
          `${current.toFixed(3)} → ${updated.toFixed(3)}`
      );
    } catch (err) {
      logger.error(`preferenceEngine: uid=${uid} failed:`, err);
    }

    return null;
  }
);

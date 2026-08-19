import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { updatePreference } from "./preferenceEngine";
import { triggerRecommendationRefresh } from "./recommendationEngine";

if (!admin.apps.length) {
  admin.initializeApp();
}

interface TradeItem {
  listingId: string;
}

interface TradeDocument {
  fromUserId: string;
  toUserId: string;
  status: string;
  myItems?: TradeItem[];       // sender's items (offered to receiver)
  theirItems?: TradeItem[];    // receiver's items (offered to sender)
}

interface ListingDoc {
  brand?: string;
  styleId?: string;
}

/**
 * Batch-fetches listing docs and returns an array of { brand, styleId } pairs.
 * Silently skips any listing that can't be found or is missing fields.
 */
async function getBrandSignals(
  listingIds: string[]
): Promise<Array<{ brand: string; styleId: string }>> {
  if (listingIds.length === 0) return [];

  const db = admin.firestore();
  const refs = listingIds.map((id) => db.doc(`listings/${id}`));
  const snaps = await db.getAll(...refs);

  return snaps
    .map((snap) => {
      const data = snap.data() as ListingDoc | undefined;
      return { brand: data?.brand ?? "", styleId: data?.styleId ?? "" };
    })
    .filter((s) => s.brand && s.styleId);
}

/**
 * Applies a preference signal for each unique brand/styleId pair.
 * Deduplicates so the same sneaker model doesn't apply the signal twice in one trade.
 */
async function applySignals(
  uid: string,
  signalType: string,
  signals: Array<{ brand: string; styleId: string }>
): Promise<void> {
  const seen = new Set<string>();
  for (const { brand, styleId } of signals) {
    const key = `${brand}:${styleId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await updatePreference(uid, signalType, { brand, styleId });
  }
}

/**
 * onTradeOutcomeSignal — fires when a trade's status changes.
 *
 * On "declined":  receiver said no → weak negative signal on receiver's profile
 *                 for the specific models and brands that were offered to them.
 *                 Jordan 1s get penalized; Jordan 11s are unaffected.
 *
 * On "completed": both parties agreed → strong positive signal for each user
 *                 based on the brands/models they actually received.
 */
export const onTradeOutcomeSignal = onDocumentUpdated(
  {
    document: "trades/{tradeId}",
    region: "us-central1",
    secrets: ["ALGOLIA_APP_ID", "ALGOLIA_ADMIN_API_KEY"],
  },
  async (event) => {
    const before = event.data?.before?.data() as TradeDocument | undefined;
    const after = event.data?.after?.data() as TradeDocument | undefined;

    if (!before || !after) return;
    if (before.status === after.status) return;

    const { fromUserId, toUserId, myItems = [], theirItems = [] } = after;

    if (after.status === "declined") {
      // Receiver (toUserId) declined → negative signal for sender's offered items
      const offeredToReceiver = myItems.map((i) => i.listingId);
      const signals = await getBrandSignals(offeredToReceiver);

      if (signals.length > 0) {
        await applySignals(toUserId, "trade_declined", signals);
        await triggerRecommendationRefresh(toUserId).catch(() => {});
        logger.info(`tradeSignals: decline signal applied for ${toUserId}, ${signals.length} items`);
      }
    }

    if (after.status === "completed") {
      // Sender (fromUserId) receives theirItems → positive signal on sender's profile
      const receivedBySender = theirItems.map((i) => i.listingId);
      const senderSignals = await getBrandSignals(receivedBySender);
      if (senderSignals.length > 0) {
        await applySignals(fromUserId, "trade_accepted", senderSignals);
        await triggerRecommendationRefresh(fromUserId).catch(() => {});
      }

      // Receiver (toUserId) receives myItems → positive signal on receiver's profile
      const receivedByReceiver = myItems.map((i) => i.listingId);
      const receiverSignals = await getBrandSignals(receivedByReceiver);
      if (receiverSignals.length > 0) {
        await applySignals(toUserId, "trade_accepted", receiverSignals);
        await triggerRecommendationRefresh(toUserId).catch(() => {});
      }

      logger.info(`tradeSignals: accept signal applied for both parties on trade ${event.params.tradeId}`);
    }
  }
);

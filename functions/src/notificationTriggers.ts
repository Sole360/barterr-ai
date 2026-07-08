import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

const db = getFirestore();

type NotificationType =
  | "new_trade"
  | "trade_accepted"
  | "trade_declined"
  | "trade_completed"
  | "account_warning"
  | "account_banned";

async function writeNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data: Record<string, string>
): Promise<void> {
  await db
    .collection("users")
    .doc(userId)
    .collection("notifications")
    .add({
      type,
      title,
      body,
      data,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
}

async function getDisplayName(uid: string): Promise<string> {
  const snap = await db.collection("users").doc(uid).get();
  return snap.data()?.displayName ?? "Someone";
}

// New trade created — notify the receiver
export const onNewTradeNotification = onDocumentCreated(
  "trades/{tradeId}",
  async (event) => {
    const tradeId = event.params.tradeId;
    const data = event.data?.data();
    if (!data) return null;

    const { fromUserId, toUserId } = data;
    if (!fromUserId || !toUserId) return null;

    try {
      const senderName = await getDisplayName(fromUserId);
      await writeNotification(
        toUserId,
        "new_trade",
        "New trade offer",
        `${senderName} wants to trade with you`,
        { tradeId, fromUserId }
      );
    } catch (err) {
      logger.error("onNewTradeNotification error:", err);
    }

    return null;
  }
);

// Trade status changed — notify relevant party
export const onTradeStatusNotification = onDocumentUpdated(
  "trades/{tradeId}",
  async (event) => {
    const tradeId = event.params.tradeId;
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return null;
    if (before.status === after.status) return null;

    const { fromUserId, toUserId } = after;
    if (!fromUserId || !toUserId) return null;

    try {
      if (after.status === "both_confirmed" || after.status === "accepted") {
        const receiverName = await getDisplayName(toUserId);
        await writeNotification(
          fromUserId,
          "trade_accepted",
          "Trade accepted!",
          `${receiverName} accepted your trade offer`,
          { tradeId }
        );
      } else if (after.status === "declined") {
        const receiverName = await getDisplayName(toUserId);
        await writeNotification(
          fromUserId,
          "trade_declined",
          "Trade declined",
          `${receiverName} declined your trade offer`,
          { tradeId }
        );
      } else if (after.status === "completed") {
        const [fromName, toName] = await Promise.all([
          getDisplayName(fromUserId),
          getDisplayName(toUserId),
        ]);
        await Promise.all([
          writeNotification(
            fromUserId,
            "trade_completed",
            "Trade completed!",
            `Your trade with ${toName} is complete`,
            { tradeId }
          ),
          writeNotification(
            toUserId,
            "trade_completed",
            "Trade completed!",
            `Your trade with ${fromName} is complete`,
            { tradeId }
          ),
        ]);
      }
    } catch (err) {
      logger.error("onTradeStatusNotification error:", err);
    }

    return null;
  }
);

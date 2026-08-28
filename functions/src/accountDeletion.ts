import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, WriteBatch } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions/v2";
import Stripe from "stripe";
import { writeAuditLog } from "./utils/auditLog";

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");

const CORS_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://barterr.ai",
  "https://dev.barterr.ai",
];

// Trades in these states are finished — anything else blocks deletion.
const TERMINAL_TRADE_STATUSES = new Set(["completed", "declined", "countered"]);

const DELETED_NAME = "Deleted User";

interface OwnerEntry {
  userId: string;
  [key: string]: unknown;
}

interface DeletionBlocker {
  type: "active_trade" | "active_order" | "wallet_balance";
  id?: string;
  amountCents?: number;
}

/**
 * deleteAccount — self-service account purge, callable by the account owner.
 *
 * Blocks when the user has an in-flight trade/order or an unpaid wallet
 * balance. Otherwise: anonymizes records shared with other users (orders,
 * conversations, posts, legacy tradeRequests), deletes everything solely
 * theirs (listings, user doc + subcollections, storage uploads), removes
 * their Stripe customer/Connect account, and finally deletes the Auth user.
 *
 * Deleting the users/{uid} doc last (with email intact) fires the existing
 * unindexUser (Algolia) and onUserDeletedMailchimp triggers.
 * training-data/** and sneakers/** storage are intentionally never touched.
 */
export const deleteAccount = onCall(
  { region: "us-central1", cors: CORS_ORIGINS, invoker: "public", secrets: [STRIPE_SECRET_KEY] },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
    const uid = req.auth.uid;
    const start = Date.now();
    const db = getFirestore();

    // ── Phase A: guards ─────────────────────────────────────────────────────
    const [fromTrades, toTrades, ordersSnap, billingSnap] = await Promise.all([
      db.collection("trades").where("fromUserId", "==", uid).get(),
      db.collection("trades").where("toUserId", "==", uid).get(),
      db.collection("orders").where("users", "array-contains", uid).get(),
      db.doc(`users/${uid}/private/billing`).get(),
    ]);

    const blockers: DeletionBlocker[] = [];

    for (const snap of [...fromTrades.docs, ...toTrades.docs]) {
      const status = (snap.data().status as string) ?? "pending";
      if (!TERMINAL_TRADE_STATUSES.has(status)) {
        blockers.push({ type: "active_trade", id: snap.id });
      }
    }

    for (const snap of ordersSnap.docs) {
      const order = snap.data();
      if (!order.completed && order.status !== "cancelled") {
        blockers.push({ type: "active_order", id: snap.id });
      }
    }

    const billing = billingSnap.data() ?? {};
    const pendingPayoutCents = (billing.pendingPayoutCents as number) ?? 0;
    if (pendingPayoutCents > 0) {
      blockers.push({ type: "wallet_balance", amountCents: pendingPayoutCents });
    }

    if (blockers.length > 0) {
      await writeAuditLog({
        eventType: "account.deletion_blocked",
        functionName: "deleteAccount",
        actorId: uid,
        targetId: uid,
        targetType: "user",
        status: "failure",
        durationMs: Date.now() - start,
        metadata: { blockers },
      });
      return { blocked: true, blockers };
    }

    // Firestore batches cap at 500 writes — chunk at 499 like profileCascade
    const batches: WriteBatch[] = [db.batch()];
    let opCount = 0;
    const addUpdate = (ref: FirebaseFirestore.DocumentReference, data: object) => {
      if (opCount > 0 && opCount % 499 === 0) batches.push(db.batch());
      batches[batches.length - 1].update(ref, data);
      opCount++;
    };
    const addDelete = (ref: FirebaseFirestore.DocumentReference) => {
      if (opCount > 0 && opCount % 499 === 0) batches.push(db.batch());
      batches[batches.length - 1].delete(ref);
      opCount++;
    };

    // ── Phase B: anonymize records shared with other users ──────────────────
    let ordersScrubbed = 0;
    for (const snap of ordersSnap.docs) {
      const order = snap.data();
      const update: Record<string, unknown> = {};
      if (order.sender?.id === uid) {
        update["sender.name"] = DELETED_NAME;
        update["sender.email"] = "";
      }
      if (order.poster?.id === uid) {
        update["poster.name"] = DELETED_NAME;
        update["poster.email"] = "";
      }
      if (Object.keys(update).length > 0) {
        addUpdate(snap.ref, update);
        ordersScrubbed++;
      }
    }

    const convsSnap = await db
      .collection("conversations")
      .where("participants", "array-contains", uid)
      .get();
    for (const snap of convsSnap.docs) {
      addUpdate(snap.ref, {
        [`participantInfo.${uid}.displayName`]: DELETED_NAME,
        [`participantInfo.${uid}.photoURL`]: null,
      });
    }

    // Legacy tradeRequests hold raw email + mobile for both parties
    const [sentReqs, receivedReqs] = await Promise.all([
      db.collection("tradeRequests").where("senderId", "==", uid).get(),
      db.collection("tradeRequests").where("posterId", "==", uid).get(),
    ]);
    for (const snap of sentReqs.docs) {
      addUpdate(snap.ref, { senderName: DELETED_NAME, senderEmail: "", senderMobile: "" });
    }
    for (const snap of receivedReqs.docs) {
      addUpdate(snap.ref, { posterName: DELETED_NAME, posterEmail: "", posterMobile: "" });
    }

    // Posts are shared catalog docs (deduped by styleId) — strip the user's
    // owners[]/wishers[] entries (they embed email + displayName), keep the doc.
    // Post IDs are derivable only from the user's listings + wishlist docs.
    const [listingsSnap, wishlistSnap] = await Promise.all([
      db.collection("listings").where("userId", "==", uid).get(),
      db.collection(`users/${uid}/wishlist`).get(),
    ]);

    const postIds = new Set<string>();
    for (const snap of listingsSnap.docs) {
      const postId = snap.data().postId as string | undefined;
      if (postId) postIds.add(postId);
    }
    for (const snap of wishlistSnap.docs) {
      const postId = snap.data().postId as string | undefined;
      if (postId) postIds.add(postId);
    }

    let postsScrubbed = 0;
    for (const postId of postIds) {
      const postSnap = await db.doc(`posts/${postId}`).get();
      if (!postSnap.exists) continue;
      const post = postSnap.data()!;
      const owners = ((post.owners as OwnerEntry[]) ?? []).filter((o) => o.userId !== uid);
      const wishers = ((post.wishers as OwnerEntry[]) ?? []).filter((w) => w.userId !== uid);
      if (
        owners.length !== ((post.owners as OwnerEntry[]) ?? []).length ||
        wishers.length !== ((post.wishers as OwnerEntry[]) ?? []).length
      ) {
        addUpdate(postSnap.ref, { owners, wishers });
        postsScrubbed++;
      }
    }

    // ── Phase C: delete solely-owned data ───────────────────────────────────
    // Listing deletes fire deleteListingPhotos (storage) + unindexPost (Algolia)
    for (const snap of listingsSnap.docs) {
      addDelete(snap.ref);
    }

    await Promise.all(batches.map((b) => b.commit()));

    // Storage: remaining user uploads. training-data/** and sneakers/** excluded.
    const bucket = getStorage().bucket();
    const storageErrors: string[] = [];
    for (const prefix of [`users/${uid}/`, `sneaker_uploads/${uid}/`]) {
      try {
        await bucket.deleteFiles({ prefix });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        storageErrors.push(`${prefix}: ${msg}`);
        logger.warn(`deleteAccount: storage cleanup failed for ${prefix}`, err);
      }
    }

    // ── Phase D: Stripe ─────────────────────────────────────────────────────
    // Failures are logged, never abort the purge — the guard already ensured
    // a zero balance, so orphaned Stripe records are recoverable manually.
    const stripeErrors: string[] = [];
    const stripeCustomerId = billing.stripeCustomerId as string | undefined;
    const stripeConnectAccountId = billing.stripeConnectAccountId as string | undefined;
    if (stripeCustomerId || stripeConnectAccountId) {
      const stripe = new Stripe(STRIPE_SECRET_KEY.value());
      if (stripeCustomerId) {
        try {
          await stripe.customers.del(stripeCustomerId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          stripeErrors.push(`customer: ${msg}`);
          logger.warn(`deleteAccount: Stripe customer delete failed uid=${uid}`, err);
        }
      }
      if (stripeConnectAccountId) {
        try {
          await stripe.accounts.del(stripeConnectAccountId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          stripeErrors.push(`connect: ${msg}`);
          logger.warn(`deleteAccount: Stripe Connect delete failed uid=${uid}`, err);
        }
      }
    }

    // ── Phase E: user doc, subcollections, auth ─────────────────────────────
    // recursiveDelete removes subcollections (notifications, swipes, wishlist,
    // cachedRecommendations, private) then the doc itself — the final doc
    // delete fires unindexUser + onUserDeletedMailchimp with email still set.
    await db.recursiveDelete(db.doc(`users/${uid}`));

    await getAuth().deleteUser(uid);

    await writeAuditLog({
      eventType: "account.purged",
      functionName: "deleteAccount",
      actorId: uid,
      targetId: uid,
      targetType: "user",
      status: "success",
      durationMs: Date.now() - start,
      metadata: {
        listingsDeleted: listingsSnap.size,
        ordersScrubbed,
        conversationsScrubbed: convsSnap.size,
        tradeRequestsScrubbed: sentReqs.size + receivedReqs.size,
        postsScrubbed,
        stripeCustomerDeleted: Boolean(stripeCustomerId) && stripeErrors.every((e) => !e.startsWith("customer")),
        stripeConnectDeleted: Boolean(stripeConnectAccountId) && stripeErrors.every((e) => !e.startsWith("connect")),
        ...(stripeErrors.length > 0 && { stripeErrors }),
        ...(storageErrors.length > 0 && { storageErrors }),
      },
    });

    logger.info(`deleteAccount: uid=${uid} purged in ${Date.now() - start}ms`);
    return { success: true };
  }
);

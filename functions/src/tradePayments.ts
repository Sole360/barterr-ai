import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import Stripe from "stripe";
import { serviceFeeCentsForCount, grossUpForStripe } from "./utils/tradePricing";
import { writeAuditLog } from "./utils/auditLog";

if (!admin.apps.length) {
  admin.initializeApp();
}

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");

const CORS_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://barterr.ai",
  "https://dev.barterr.ai",
];

// Types for trade document
type TradeStatus =
  | "pending"
  | "both_confirmed"
  | "processing"
  | "completed"
  | "failed"
  | "declined";

type PaymentStatus = "pending" | "succeeded" | "failed" | null;

interface TradeDocument {
  fromUserId: string;
  toUserId: string;
  status: TradeStatus;

  senderConfirmed: boolean;
  senderSneakerCount: number;
  senderServiceFeeCents: number;
  senderCashDepositCents: number;
  senderProcessingFeeCents: number;
  senderTotalCents: number;
  senderPaymentMethodId: string;

  receiverConfirmed: boolean;
  receiverSneakerCount: number;
  receiverServiceFeeCents: number;
  receiverCashDepositCents: number;
  receiverProcessingFeeCents: number;
  receiverTotalCents: number;
  receiverPaymentMethodId: string;

  senderPaymentIntentId: string | null;
  senderPaymentStatus: PaymentStatus;
  senderPaymentError: string | null;

  receiverPaymentIntentId: string | null;
  receiverPaymentStatus: PaymentStatus;
  receiverPaymentError: string | null;

  theirItems: Array<{ listingId: string }>;
  askCash: number;
}

interface BillingDoc {
  stripeCustomerId?: string;
  defaultPaymentMethodId?: string;
}

/**
 * Helper: Charge a user with manual capture (authorization only)
 */
async function authorizePayment(
  stripe: Stripe,
  userId: string,
  amountCents: number,
  paymentMethodId: string,
  tradeId: string,
  role: "sender" | "receiver"
): Promise<{
  paymentIntentId: string | null;
  status: PaymentStatus;
  error: string | null;
}> {
  try {
    const db = admin.firestore();
    const billingSnap = await db.doc(`users/${userId}/private/billing`).get();
    const billing = billingSnap.data() as BillingDoc | undefined;
    const customerId = billing?.stripeCustomerId;

    if (!customerId) {
      return {
        paymentIntentId: null,
        status: "failed",
        error: "No Stripe customer found",
      };
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      customer: customerId,
      payment_method: paymentMethodId,
      capture_method: "manual", // Authorize only, capture later
      confirm: true,
      off_session: true,
      metadata: {
        tradeId,
        role,
        userId,
      },
    });

    // Check if authorization succeeded
    if (
      paymentIntent.status === "requires_capture" ||
      paymentIntent.status === "succeeded"
    ) {
      return {
        paymentIntentId: paymentIntent.id,
        status: "succeeded",
        error: null,
      };
    }

    return {
      paymentIntentId: paymentIntent.id,
      status: "failed",
      error: `Unexpected status: ${paymentIntent.status}`,
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Payment authorization failed";
    return {
      paymentIntentId: null,
      status: "failed",
      error: message,
    };
  }
}

/**
 * acceptTrade - Called when receiver clicks "Accept"
 *
 * 1. Validates user is the receiver
 * 2. Requires payment method on file
 * 3. Calculates receiver's fees
 * 4. Updates trade to trigger payment processing
 */
export const acceptTrade = onCall(
  {
    region: "us-central1",
    invoker: "public",
    secrets: [STRIPE_SECRET_KEY],
    cors: CORS_ORIGINS,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const { tradeId } = request.data as { tradeId?: string };
    if (!tradeId) {
      throw new HttpsError("invalid-argument", "Missing tradeId parameter.");
    }

    const db = admin.firestore();
    const tradeRef = db.doc(`trades/${tradeId}`);
    const tradeSnap = await tradeRef.get();

    if (!tradeSnap.exists) {
      throw new HttpsError("not-found", "Trade not found.");
    }

    const trade = tradeSnap.data() as TradeDocument;

    // Validate user is the receiver
    if (trade.toUserId !== uid) {
      throw new HttpsError(
        "permission-denied",
        "Only the trade recipient can accept."
      );
    }

    // Check trade status
    if (trade.status !== "pending") {
      throw new HttpsError(
        "failed-precondition",
        `Trade cannot be accepted (status: ${trade.status}).`
      );
    }

    if (trade.receiverConfirmed) {
      throw new HttpsError("failed-precondition", "Trade already accepted.");
    }

    // Fetch receiver's billing doc - REQUIRE payment method
    const billingSnap = await db.doc(`users/${uid}/private/billing`).get();
    const billing = billingSnap.data() as BillingDoc | undefined;

    if (!billing?.defaultPaymentMethodId) {
      throw new HttpsError(
        "failed-precondition",
        "Please add a payment method before accepting."
      );
    }

    // Calculate receiver pricing
    // Receiver gives: theirItems (sneakers) + askCash (cash sender requested)
    const receiverSneakerCount = trade.theirItems?.length || 0;
    const receiverCashDeposit = trade.askCash || 0;

    const receiverServiceFeeCents =
      serviceFeeCentsForCount(receiverSneakerCount);
    const receiverCashDepositCents = Math.round(receiverCashDeposit * 100);
    const netCents = receiverCashDepositCents + receiverServiceFeeCents;
    const { grossCents, feeCents } = grossUpForStripe(netCents);

    // Update trade with receiver confirmation
    await tradeRef.update({
      receiverConfirmed: true,
      receiverConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      receiverSneakerCount,
      receiverServiceFeeCents,
      receiverCashDepositCents,
      receiverProcessingFeeCents: feeCents,
      receiverTotalCents: grossCents,
      receiverPaymentMethodId: billing.defaultPaymentMethodId,
      status: "both_confirmed",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await writeAuditLog({
      eventType: "trade.accepted",
      functionName: "acceptTrade",
      actorId: uid,
      targetId: tradeId,
      targetType: "trade",
      status: "success",
      durationMs: 0,
      metadata: { receiverTotalCents: grossCents, receiverSneakerCount },
    });

    return {
      success: true,
      receiverTotalCents: grossCents,
    };
  }
);

/**
 * onTradeConfirmed - Firestore trigger when status becomes "both_confirmed"
 *
 * 1. Authorizes payment for sender
 * 2. Authorizes payment for receiver
 * 3. If both succeed, captures both
 * 4. If one fails, cancels the successful authorization
 */
export const onTradeConfirmed = onDocumentUpdated(
  {
    document: "trades/{tradeId}",
    region: "us-central1",
    secrets: [STRIPE_SECRET_KEY],
  },
  async (event) => {
    const before = event.data?.before?.data() as TradeDocument | undefined;
    const after = event.data?.after?.data() as TradeDocument | undefined;
    const tradeId = event.params.tradeId;

    if (!before || !after) return;

    // Only proceed if status just changed to "both_confirmed"
    if (before.status === "both_confirmed") return;
    if (after.status !== "both_confirmed") return;

    const secret = STRIPE_SECRET_KEY.value();
    if (!secret) {
      logger.error("Stripe secret not configured");
      return;
    }

    const stripe = new Stripe(secret);
    const db = admin.firestore();
    const tradeRef = db.doc(`trades/${tradeId}`);

    // Update to processing state
    await tradeRef.update({ status: "processing" });

    // Authorize both payments
    const senderResult = await authorizePayment(
      stripe,
      after.fromUserId,
      after.senderTotalCents,
      after.senderPaymentMethodId,
      tradeId,
      "sender"
    );

    const receiverResult = await authorizePayment(
      stripe,
      after.toUserId,
      after.receiverTotalCents,
      after.receiverPaymentMethodId,
      tradeId,
      "receiver"
    );

    const bothSucceeded =
      senderResult.status === "succeeded" &&
      receiverResult.status === "succeeded";

    if (bothSucceeded) {
      // Capture both payments
      try {
        const capturePromises: Promise<Stripe.PaymentIntent>[] = [];

        if (senderResult.paymentIntentId) {
          capturePromises.push(
            stripe.paymentIntents.capture(senderResult.paymentIntentId)
          );
        }
        if (receiverResult.paymentIntentId) {
          capturePromises.push(
            stripe.paymentIntents.capture(receiverResult.paymentIntentId)
          );
        }

        await Promise.all(capturePromises);

        // Update trade as completed
        await tradeRef.update({
          senderPaymentIntentId: senderResult.paymentIntentId,
          senderPaymentStatus: "succeeded",
          senderPaymentError: null,
          senderChargedAt: admin.firestore.FieldValue.serverTimestamp(),

          receiverPaymentIntentId: receiverResult.paymentIntentId,
          receiverPaymentStatus: "succeeded",
          receiverPaymentError: null,
          receiverChargedAt: admin.firestore.FieldValue.serverTimestamp(),

          status: "completed",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await writeAuditLog({
          eventType: "trade.payment_captured",
          functionName: "onTradeConfirmed",
          actorId: "system",
          targetId: tradeId,
          targetType: "trade",
          status: "success",
          durationMs: 0,
          metadata: {
            senderPaymentIntentId: senderResult.paymentIntentId,
            senderTotalCents: after.senderTotalCents,
            receiverPaymentIntentId: receiverResult.paymentIntentId,
            receiverTotalCents: after.receiverTotalCents,
          },
        });
      } catch (captureError: unknown) {
        const message =
          captureError instanceof Error
            ? captureError.message
            : "Capture failed";
        logger.error("Capture error:", message);

        // Cancel any authorized payments
        if (senderResult.paymentIntentId) {
          await stripe.paymentIntents
            .cancel(senderResult.paymentIntentId)
            .catch(() => {});
        }
        if (receiverResult.paymentIntentId) {
          await stripe.paymentIntents
            .cancel(receiverResult.paymentIntentId)
            .catch(() => {});
        }

        await tradeRef.update({
          senderPaymentIntentId: senderResult.paymentIntentId,
          senderPaymentStatus: "failed",
          senderPaymentError: message,

          receiverPaymentIntentId: receiverResult.paymentIntentId,
          receiverPaymentStatus: "failed",
          receiverPaymentError: message,

          status: "failed",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await writeAuditLog({
          eventType: "trade.payment_failed",
          functionName: "onTradeConfirmed",
          actorId: "system",
          targetId: tradeId,
          targetType: "trade",
          status: "failure",
          durationMs: 0,
          metadata: { error: message, stage: "capture" },
        });
      }
    } else {
      // One or both authorizations failed - cancel the successful one
      if (
        senderResult.status === "succeeded" &&
        senderResult.paymentIntentId
      ) {
        await stripe.paymentIntents
          .cancel(senderResult.paymentIntentId)
          .catch(() => {});
      }
      if (
        receiverResult.status === "succeeded" &&
        receiverResult.paymentIntentId
      ) {
        await stripe.paymentIntents
          .cancel(receiverResult.paymentIntentId)
          .catch(() => {});
      }

      // Update trade with failure details
      await tradeRef.update({
        senderPaymentIntentId: senderResult.paymentIntentId,
        senderPaymentStatus: senderResult.status,
        senderPaymentError: senderResult.error,

        receiverPaymentIntentId: receiverResult.paymentIntentId,
        receiverPaymentStatus: receiverResult.status,
        receiverPaymentError: receiverResult.error,

        status: "failed",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await writeAuditLog({
        eventType: "trade.payment_failed",
        functionName: "onTradeConfirmed",
        actorId: "system",
        targetId: tradeId,
        targetType: "trade",
        status: "failure",
        durationMs: 0,
        metadata: {
          stage: "authorization",
          senderStatus: senderResult.status,
          senderError: senderResult.error,
          receiverStatus: receiverResult.status,
          receiverError: receiverResult.error,
        },
      });
    }
  }
);

/**
 * retryPayment - Called when user retries after card failure
 *
 * 1. Validates user's payment failed
 * 2. Creates new authorization with updated payment method
 * 3. If both now succeeded, captures both
 */
export const retryPayment = onCall(
  {
    region: "us-central1",
    invoker: "public",
    secrets: [STRIPE_SECRET_KEY],
    cors: CORS_ORIGINS,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const { tradeId } = request.data as { tradeId?: string };
    if (!tradeId) {
      throw new HttpsError("invalid-argument", "Missing tradeId parameter.");
    }

    const db = admin.firestore();
    const tradeRef = db.doc(`trades/${tradeId}`);
    const tradeSnap = await tradeRef.get();

    if (!tradeSnap.exists) {
      throw new HttpsError("not-found", "Trade not found.");
    }

    const trade = tradeSnap.data() as TradeDocument;

    // Determine if user is sender or receiver
    const isSender = trade.fromUserId === uid;
    const isReceiver = trade.toUserId === uid;

    if (!isSender && !isReceiver) {
      throw new HttpsError("permission-denied", "Not a party to this trade.");
    }

    // Check trade status
    if (trade.status !== "failed") {
      throw new HttpsError(
        "failed-precondition",
        "Can only retry failed trades."
      );
    }

    // Check that their payment failed
    const myPaymentStatus = isSender
      ? trade.senderPaymentStatus
      : trade.receiverPaymentStatus;

    if (myPaymentStatus !== "failed") {
      throw new HttpsError(
        "failed-precondition",
        "Your payment did not fail."
      );
    }

    // Get their updated payment method
    const billingSnap = await db.doc(`users/${uid}/private/billing`).get();
    const billing = billingSnap.data() as BillingDoc | undefined;

    if (!billing?.defaultPaymentMethodId) {
      throw new HttpsError(
        "failed-precondition",
        "Please add a payment method first."
      );
    }

    const secret = STRIPE_SECRET_KEY.value();
    if (!secret) {
      throw new HttpsError("failed-precondition", "Stripe is not configured.");
    }

    const stripe = new Stripe(secret);
    const amountCents = isSender
      ? trade.senderTotalCents
      : trade.receiverTotalCents;
    const role = isSender ? "sender" : "receiver";

    // Retry the authorization
    const result = await authorizePayment(
      stripe,
      uid,
      amountCents,
      billing.defaultPaymentMethodId,
      tradeId,
      role
    );

    const prefix = isSender ? "sender" : "receiver";
    const otherPrefix = isSender ? "receiver" : "sender";
    const otherStatus = isSender
      ? trade.receiverPaymentStatus
      : trade.senderPaymentStatus;
    const otherPaymentIntentId = isSender
      ? trade.receiverPaymentIntentId
      : trade.senderPaymentIntentId;

    if (result.status === "succeeded") {
      // Check if other party also succeeded (or needs new auth)
      if (otherStatus === "succeeded" && otherPaymentIntentId) {
        // Both authorizations are now successful - capture both
        try {
          await Promise.all([
            stripe.paymentIntents.capture(result.paymentIntentId!),
            stripe.paymentIntents.capture(otherPaymentIntentId),
          ]);

          await tradeRef.update({
            [`${prefix}PaymentIntentId`]: result.paymentIntentId,
            [`${prefix}PaymentStatus`]: "succeeded",
            [`${prefix}PaymentError`]: null,
            [`${prefix}PaymentMethodId`]: billing.defaultPaymentMethodId,
            [`${prefix}ChargedAt`]: admin.firestore.FieldValue.serverTimestamp(),
            status: "completed",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          await writeAuditLog({
            eventType: "trade.payment_retried",
            functionName: "retryPayment",
            actorId: uid,
            targetId: tradeId,
            targetType: "trade",
            status: "success",
            durationMs: 0,
            metadata: { role, newPaymentIntentId: result.paymentIntentId },
          });
          return { success: true, status: "completed" };
        } catch (captureError: unknown) {
          const message =
            captureError instanceof Error
              ? captureError.message
              : "Capture failed";

          // Cancel both
          await stripe.paymentIntents
            .cancel(result.paymentIntentId!)
            .catch(() => {});
          await stripe.paymentIntents
            .cancel(otherPaymentIntentId)
            .catch(() => {});

          await tradeRef.update({
            [`${prefix}PaymentIntentId`]: result.paymentIntentId,
            [`${prefix}PaymentStatus`]: "failed",
            [`${prefix}PaymentError`]: message,
            [`${otherPrefix}PaymentStatus`]: "failed",
            [`${otherPrefix}PaymentError`]: message,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          return { success: false, error: message };
        }
      } else {
        // Other party still needs to retry - update our side and wait
        await tradeRef.update({
          [`${prefix}PaymentIntentId`]: result.paymentIntentId,
          [`${prefix}PaymentStatus`]: "succeeded",
          [`${prefix}PaymentError`]: null,
          [`${prefix}PaymentMethodId`]: billing.defaultPaymentMethodId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {
          success: true,
          status: "waiting_for_other_party",
          message: "Waiting for the other party to fix their payment.",
        };
      }
    } else {
      // Retry failed
      await tradeRef.update({
        [`${prefix}PaymentIntentId`]: result.paymentIntentId,
        [`${prefix}PaymentStatus`]: "failed",
        [`${prefix}PaymentError`]: result.error,
        [`${prefix}PaymentMethodId`]: billing.defaultPaymentMethodId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: false, error: result.error };
    }
  }
);

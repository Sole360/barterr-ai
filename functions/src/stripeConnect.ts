import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import Stripe from "stripe";
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

interface BillingDoc {
  stripeCustomerId?: string;
  defaultPaymentMethodId?: string;
  stripeConnectAccountId?: string;
  stripeConnectStatus?: "pending" | "active" | "restricted";
  pendingPayoutCents?: number;
  lifetimeEarningsCents?: number;
}

interface TradeDocument {
  fromUserId: string;
  toUserId: string;
  status: string;
  senderCashDepositCents: number;
  receiverCashDepositCents: number;
}

/**
 * createConnectAccount — creates a Stripe Connect Express account for the user.
 * Idempotent: returns existing account ID if already created.
 */
export const createConnectAccount = onCall(
  {
    region: "us-central1",
    invoker: "public",
    secrets: [STRIPE_SECRET_KEY],
    cors: CORS_ORIGINS,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.");

    const db = admin.firestore();
    const billingRef = db.doc(`users/${uid}/private/billing`);
    const billingSnap = await billingRef.get();
    const billing = billingSnap.data() as BillingDoc | undefined;

    if (billing?.stripeConnectAccountId) {
      return { accountId: billing.stripeConnectAccountId };
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY.value());

    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      capabilities: {
        transfers: { requested: true },
      },
      settings: {
        payouts: {
          schedule: { interval: "manual" },
        },
      },
      metadata: { barterrUid: uid },
    });

    await billingRef.set(
      {
        stripeConnectAccountId: account.id,
        stripeConnectStatus: "pending",
      },
      { merge: true }
    );

    await writeAuditLog({
      eventType: "connect.account_created",
      functionName: "createConnectAccount",
      actorId: uid,
      targetId: account.id,
      targetType: "user",
      status: "success",
      durationMs: 0,
      metadata: { uid },
    });

    return { accountId: account.id };
  }
);

/**
 * getConnectOnboardingLink — generates a Stripe-hosted KYC onboarding URL.
 * Call this after createConnectAccount. Redirect the browser to the returned URL.
 */
export const getConnectOnboardingLink = onCall(
  {
    region: "us-central1",
    invoker: "public",
    secrets: [STRIPE_SECRET_KEY],
    cors: CORS_ORIGINS,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.");

    const { returnUrl, refreshUrl } = request.data as {
      returnUrl?: string;
      refreshUrl?: string;
    };

    const db = admin.firestore();
    const billingSnap = await db.doc(`users/${uid}/private/billing`).get();
    const billing = billingSnap.data() as BillingDoc | undefined;

    const accountId = billing?.stripeConnectAccountId;
    if (!accountId) {
      throw new HttpsError("failed-precondition", "No Connect account found. Call createConnectAccount first.");
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY.value());

    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      return_url: returnUrl ?? "https://barterr.ai/wallet?onboarding=complete",
      refresh_url: refreshUrl ?? "https://barterr.ai/wallet?onboarding=refresh",
    });

    return { url: link.url };
  }
);

/**
 * getConnectDashboardLink — returns a Stripe Express dashboard login link.
 * Only works after the account has completed onboarding.
 */
export const getConnectDashboardLink = onCall(
  {
    region: "us-central1",
    invoker: "public",
    secrets: [STRIPE_SECRET_KEY],
    cors: CORS_ORIGINS,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.");

    const db = admin.firestore();
    const billingSnap = await db.doc(`users/${uid}/private/billing`).get();
    const billing = billingSnap.data() as BillingDoc | undefined;

    const accountId = billing?.stripeConnectAccountId;
    if (!accountId) {
      throw new HttpsError("failed-precondition", "No Connect account found.");
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY.value());

    const loginLink = await stripe.accounts.createLoginLink(accountId);
    return { url: loginLink.url };
  }
);

/**
 * syncConnectAccount — called when user returns from Stripe onboarding.
 * Updates stripeConnectStatus in Firestore and processes any pending payouts.
 */
export const syncConnectAccount = onCall(
  {
    region: "us-central1",
    invoker: "public",
    secrets: [STRIPE_SECRET_KEY],
    cors: CORS_ORIGINS,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.");

    const db = admin.firestore();
    const billingRef = db.doc(`users/${uid}/private/billing`);
    const billingSnap = await billingRef.get();
    const billing = billingSnap.data() as BillingDoc | undefined;

    const accountId = billing?.stripeConnectAccountId;
    if (!accountId) {
      return { status: "no_account" };
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    const account = await stripe.accounts.retrieve(accountId);

    const isActive = account.details_submitted && account.charges_enabled;
    const newStatus: BillingDoc["stripeConnectStatus"] = isActive
      ? "active"
      : account.details_submitted
      ? "restricted"
      : "pending";

    await billingRef.set({ stripeConnectStatus: newStatus }, { merge: true });

    // Process any pending payouts now that account may be active
    const pendingCents = billing?.pendingPayoutCents ?? 0;
    if (isActive && pendingCents > 0) {
      try {
        await stripe.transfers.create({
          amount: pendingCents,
          currency: "usd",
          destination: accountId,
          metadata: { reason: "pending_payout_release", barterrUid: uid },
        });

        await billingRef.set(
          {
            pendingPayoutCents: 0,
            walletTransferCents: admin.firestore.FieldValue.increment(pendingCents),
            lifetimeEarningsCents: admin.firestore.FieldValue.increment(pendingCents),
          },
          { merge: true }
        );

        await writeAuditLog({
          eventType: "connect.pending_released",
          functionName: "syncConnectAccount",
          actorId: "system",
          targetId: uid,
          targetType: "user",
          status: "success",
          durationMs: 0,
          metadata: { amountCents: pendingCents, accountId },
        });
      } catch (err) {
        logger.error("Failed to transfer pending payout during sync:", err);
      }
    }

    return { status: newStatus, pendingCents };
  }
);

/**
 * getWalletData — returns wallet data for the frontend.
 * Reads from Firestore billing doc + Stripe balance API.
 */
export const getWalletData = onCall(
  {
    region: "us-central1",
    invoker: "public",
    secrets: [STRIPE_SECRET_KEY],
    cors: CORS_ORIGINS,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.");

    const db = admin.firestore();
    const billingSnap = await db.doc(`users/${uid}/private/billing`).get();
    const billing = billingSnap.data() as BillingDoc | undefined;

    const accountId = billing?.stripeConnectAccountId;
    const connectStatus = billing?.stripeConnectStatus ?? null;
    const pendingPayoutCents = billing?.pendingPayoutCents ?? 0;
    const lifetimeEarningsCents = billing?.lifetimeEarningsCents ?? 0;

    let availableBalanceCents = 0;
    let pendingBalanceCents = 0;

    if (accountId && connectStatus === "active") {
      try {
        const stripe = new Stripe(STRIPE_SECRET_KEY.value());
        const balance = await stripe.balance.retrieve({
          stripeAccount: accountId,
        });
        const usdAvailable = balance.available.find((b) => b.currency === "usd");
        const usdPending = balance.pending.find((b) => b.currency === "usd");
        availableBalanceCents = usdAvailable?.amount ?? 0;
        pendingBalanceCents = usdPending?.amount ?? 0;
      } catch (err) {
        logger.warn("Could not retrieve Connect balance:", err);
      }
    }

    return {
      hasConnectAccount: !!accountId,
      connectStatus,
      pendingPayoutCents,
      lifetimeEarningsCents,
      availableBalanceCents,
      pendingBalanceCents,
    };
  }
);

/**
 * withdrawEarnings — initiates a payout from the user's Connect account to their bank.
 * The user must have a bank account on file in their Express account.
 */
export const withdrawEarnings = onCall(
  {
    region: "us-central1",
    invoker: "public",
    secrets: [STRIPE_SECRET_KEY],
    cors: CORS_ORIGINS,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.");

    const db = admin.firestore();
    const billingSnap = await db.doc(`users/${uid}/private/billing`).get();
    const billing = billingSnap.data() as BillingDoc | undefined;

    const accountId = billing?.stripeConnectAccountId;
    if (!accountId) {
      throw new HttpsError("failed-precondition", "No Connect account found.");
    }
    if (billing?.stripeConnectStatus !== "active") {
      throw new HttpsError("failed-precondition", "Complete payout setup first.");
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY.value());

    // Verify available balance
    const balance = await stripe.balance.retrieve({ stripeAccount: accountId });
    const usdAvailable = balance.available.find((b) => b.currency === "usd");
    const availableCents = usdAvailable?.amount ?? 0;

    if (availableCents <= 0) {
      throw new HttpsError("failed-precondition", "No available balance to withdraw.");
    }

    const payout = await stripe.payouts.create(
      {
        amount: availableCents,
        currency: "usd",
        metadata: { barterrUid: uid },
      },
      { stripeAccount: accountId }
    );

    // Clear the badge — user has withdrawn their balance
    await db.doc(`users/${uid}/private/billing`).set(
      { walletTransferCents: 0 },
      { merge: true }
    );

    await writeAuditLog({
      eventType: "connect.withdrawal",
      functionName: "withdrawEarnings",
      actorId: uid,
      targetId: accountId,
      targetType: "user",
      status: "success",
      durationMs: 0,
      metadata: { amountCents: availableCents, payoutId: payout.id },
    });

    return { success: true, payoutId: payout.id, amountCents: availableCents };
  }
);

/**
 * onTradeCompletedPayout — fires when trade status changes to "completed".
 * Transfers any cash component to the recipient's Connect account (or queues it
 * as pendingPayoutCents if they haven't set up payouts yet).
 *
 * Cash flow:
 *   senderCashDepositCents > 0  → receiver (toUserId) gets that cash
 *   receiverCashDepositCents > 0 → sender (fromUserId) gets that cash
 */
export const onTradeCompletedPayout = onDocumentUpdated(
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
    if (before.status === "completed") return;
    if (after.status !== "completed") return;

    const db = admin.firestore();
    const stripe = new Stripe(STRIPE_SECRET_KEY.value());

    const transfers: Array<{ recipientUid: string; amountCents: number; role: string }> = [];

    if (after.senderCashDepositCents > 0) {
      transfers.push({
        recipientUid: after.toUserId,
        amountCents: after.senderCashDepositCents,
        role: "receiver_cash",
      });
    }
    if (after.receiverCashDepositCents > 0) {
      transfers.push({
        recipientUid: after.fromUserId,
        amountCents: after.receiverCashDepositCents,
        role: "sender_cash",
      });
    }

    if (transfers.length === 0) return;

    for (const { recipientUid, amountCents, role } of transfers) {
      const billingRef = db.doc(`users/${recipientUid}/private/billing`);
      const billingSnap = await billingRef.get();
      const billing = billingSnap.data() as BillingDoc | undefined;

      const accountId = billing?.stripeConnectAccountId;
      const connectStatus = billing?.stripeConnectStatus;

      if (accountId && connectStatus === "active") {
        try {
          await stripe.transfers.create({
            amount: amountCents,
            currency: "usd",
            destination: accountId,
            transfer_group: tradeId,
            metadata: { tradeId, role, barterrUid: recipientUid },
          });

          await billingRef.set(
            {
              walletTransferCents: admin.firestore.FieldValue.increment(amountCents),
              lifetimeEarningsCents: admin.firestore.FieldValue.increment(amountCents),
            },
            { merge: true }
          );

          await writeAuditLog({
            eventType: "connect.transfer",
            functionName: "onTradeCompletedPayout",
            actorId: "system",
            targetId: tradeId,
            targetType: "trade",
            status: "success",
            durationMs: 0,
            metadata: { recipientUid, amountCents, role, accountId },
          });
        } catch (err) {
          logger.error(`Transfer failed for ${role} on trade ${tradeId}:`, err);

          // Queue as pending so user can claim after Connect setup
          await billingRef.set(
            {
              pendingPayoutCents: admin.firestore.FieldValue.increment(amountCents),
            },
            { merge: true }
          );

          await writeAuditLog({
            eventType: "connect.transfer",
            functionName: "onTradeCompletedPayout",
            actorId: "system",
            targetId: tradeId,
            targetType: "trade",
            status: "failure",
            durationMs: 0,
            metadata: { recipientUid, amountCents, role, error: String(err) },
          });
        }
      } else {
        // No active Connect account — queue for later
        await billingRef.set(
          {
            pendingPayoutCents: admin.firestore.FieldValue.increment(amountCents),
          },
          { merge: true }
        );

        logger.info(`Queued ${amountCents}¢ for ${recipientUid} (no active Connect account)`);
      }
    }
  }
);

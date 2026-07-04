import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import Stripe from "stripe";

if (!admin.apps.length) {
  admin.initializeApp();
}

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");

type BillingDoc = {
  stripeCustomerId?: string;
  defaultPaymentMethodId?: string;
  defaultPaymentMethodBrand?: string;
  defaultPaymentMethodLast4?: string;
  defaultPaymentMethodExpMonth?: number;
  defaultPaymentMethodExpYear?: number;
  updatedAt?: admin.firestore.FieldValue;
};

const toCardSummary = (pm: Stripe.PaymentMethod) => {
  const card = pm.card;
  return {
    id: pm.id,
    brand: card?.brand ?? "",
    last4: card?.last4 ?? "",
    expMonth: card?.exp_month ?? 0,
    expYear: card?.exp_year ?? 0,
  };
};

export const createSetupIntent = onCall(
  {
    region: "us-central1",
    invoker: "public",
    secrets: [STRIPE_SECRET_KEY],
    cors: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://barterr.ai",
      "https://dev.barterr.ai",
    ],
  },
  async (request) => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    // If forceNew is true, always create a new SetupIntent (for changing payment method)
    const { forceNew = false } = (request.data as { forceNew?: boolean }) ?? {};

    const secret = STRIPE_SECRET_KEY.value();
    if (!secret) {
      throw new HttpsError(
        "failed-precondition",
        "Stripe is not configured (missing STRIPE_SECRET_KEY)."
      );
    }

    const stripe = new Stripe(secret);

    const db = admin.firestore();
    const billingRef = db.doc(`users/${uid}/private/billing`);
    const billingSnap = await billingRef.get();
    const billing =
      (billingSnap.exists ? (billingSnap.data() as BillingDoc) : {}) ?? {};

    // 1) Ensure Stripe customer exists
    let stripeCustomerId = billing.stripeCustomerId;
    if (!stripeCustomerId) {
      try {
        const customer = await stripe.customers.create({ metadata: { uid } });
        stripeCustomerId = customer.id;
        await billingRef.set(
          { stripeCustomerId, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
      } catch (err: unknown) {
        logger.error("[createSetupIntent] customer creation failed", { uid, error: err });
        throw new HttpsError("internal", "Failed to set up billing. Please try again.");
      }
    }

    // If not forcing new, check for existing payment method
    if (!forceNew) {
      // 2) Return existing PM from Firestore if available
      if (billing.defaultPaymentMethodId) {
        return {
          stripeCustomerId,
          defaultPaymentMethodId: billing.defaultPaymentMethodId,
          card: billing.defaultPaymentMethodLast4
            ? {
                brand: billing.defaultPaymentMethodBrand ?? "",
                last4: billing.defaultPaymentMethodLast4 ?? "",
                expMonth: billing.defaultPaymentMethodExpMonth ?? 0,
                expYear: billing.defaultPaymentMethodExpYear ?? 0,
              }
            : null,
        };
      }

      // 3) Discover existing saved card in Stripe
      try {
        const pms = await stripe.paymentMethods.list({
          customer: stripeCustomerId,
          type: "card",
          limit: 1,
        });
        const existing = pms.data[0] ?? null;
        if (existing) {
          const summary = toCardSummary(existing);
          await billingRef.set(
            {
              defaultPaymentMethodId: summary.id,
              defaultPaymentMethodBrand: summary.brand,
              defaultPaymentMethodLast4: summary.last4,
              defaultPaymentMethodExpMonth: summary.expMonth,
              defaultPaymentMethodExpYear: summary.expYear,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          return {
            stripeCustomerId,
            defaultPaymentMethodId: summary.id,
            card: { brand: summary.brand, last4: summary.last4, expMonth: summary.expMonth, expYear: summary.expYear },
          };
        }
      } catch (err: unknown) {
        logger.error("[createSetupIntent] listing payment methods failed", { uid, error: err });
        throw new HttpsError("internal", "Failed to retrieve payment methods. Please try again.");
      }
    }

    // 4) Create SetupIntent for Payment Element
    try {
      const setupIntent = await stripe.setupIntents.create({
        customer: stripeCustomerId,
        usage: "off_session",
        payment_method_types: ["card"],
        metadata: { uid },
      });
      if (!setupIntent.client_secret) {
        throw new HttpsError("internal", "Stripe SetupIntent did not return a client secret.");
      }
      return { stripeCustomerId, clientSecret: setupIntent.client_secret, defaultPaymentMethodId: "", card: null };
    } catch (err: unknown) {
      if (err instanceof HttpsError) throw err;
      logger.error("[createSetupIntent] SetupIntent creation failed", { uid, error: err });
      throw new HttpsError("internal", "Failed to initialize payment setup. Please try again.");
    }
  }
);

/**
 * Called after the user confirms a SetupIntent on the frontend.
 * Attaches the payment method to the customer (if needed), sets it as default,
 * and stores card summary in Firestore.
 */
export const setDefaultPaymentMethod = onCall(
  {
    region: "us-central1",
    invoker: "public",
    secrets: [STRIPE_SECRET_KEY],
    cors: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://barterr.ai",
      "https://dev.barterr.ai",
    ],
  },
  async (request) => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const { paymentMethodId } = request.data as { paymentMethodId?: string };

    if (!paymentMethodId) {
      throw new HttpsError(
        "invalid-argument",
        "Missing paymentMethodId parameter."
      );
    }

    const secret = STRIPE_SECRET_KEY.value();
    if (!secret) {
      throw new HttpsError(
        "failed-precondition",
        "Stripe is not configured (missing STRIPE_SECRET_KEY)."
      );
    }

    const stripe = new Stripe(secret);

    const db = admin.firestore();
    const billingRef = db.doc(`users/${uid}/private/billing`);
    const billingSnap = await billingRef.get();
    const billing =
      (billingSnap.exists ? (billingSnap.data() as BillingDoc) : {}) ?? {};

    // 1) Ensure Stripe customer exists
    let stripeCustomerId = billing.stripeCustomerId;
    if (!stripeCustomerId) {
      try {
        const customer = await stripe.customers.create({ metadata: { uid } });
        stripeCustomerId = customer.id;
        await billingRef.set(
          { stripeCustomerId, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
      } catch (err: unknown) {
        logger.error("[setDefaultPaymentMethod] customer creation failed", { uid, error: err });
        throw new HttpsError("internal", "Failed to set up billing. Please try again.");
      }
    }

    // 2) Retrieve the payment method to get card details
    let pm: Stripe.PaymentMethod;
    try {
      pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    } catch (err: unknown) {
      logger.error("[setDefaultPaymentMethod] retrieve failed", { uid, paymentMethodId, error: err });
      throw new HttpsError("internal", "Failed to retrieve payment method. Please try again.");
    }

    // 3) Attach payment method to customer if not already attached
    try {
      if (!pm.customer) {
        await stripe.paymentMethods.attach(paymentMethodId, { customer: stripeCustomerId });
      } else if (pm.customer !== stripeCustomerId) {
        throw new HttpsError("failed-precondition", "Payment method belongs to a different customer.");
      }
    } catch (err: unknown) {
      if (err instanceof HttpsError) throw err;
      logger.error("[setDefaultPaymentMethod] attach failed", { uid, paymentMethodId, error: err });
      throw new HttpsError("internal", "Failed to attach payment method. Please try again.");
    }

    // 4) Set as default and update Firestore
    try {
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    } catch (err: unknown) {
      logger.error("[setDefaultPaymentMethod] customer update failed", { uid, error: err });
      throw new HttpsError("internal", "Failed to set default payment method. Please try again.");
    }

    const summary = toCardSummary(pm);
    await billingRef.set(
      {
        defaultPaymentMethodId: summary.id,
        defaultPaymentMethodBrand: summary.brand,
        defaultPaymentMethodLast4: summary.last4,
        defaultPaymentMethodExpMonth: summary.expMonth,
        defaultPaymentMethodExpYear: summary.expYear,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      defaultPaymentMethodId: summary.id,
      card: { brand: summary.brand, last4: summary.last4, expMonth: summary.expMonth, expYear: summary.expYear },
    };
  }
);

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
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

    const secret = STRIPE_SECRET_KEY.value();
    if (!secret) {
      throw new HttpsError(
        "failed-precondition",
        "Stripe is not configured (missing STRIPE_SECRET_KEY).",
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
      const customer = await stripe.customers.create({ metadata: { uid } });
      stripeCustomerId = customer.id;

      await billingRef.set(
        {
          stripeCustomerId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    // 2) If we already have a default PM in Firestore, return it (+ summary if we have it)
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

    // 3) Otherwise, try to discover an existing saved card in Stripe (so we don’t create a new SetupIntent unnecessarily)
    //    Stripe: list customer payment methods (type: card)
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
        { merge: true },
      );

      return {
        stripeCustomerId,
        defaultPaymentMethodId: summary.id,
        card: {
          brand: summary.brand,
          last4: summary.last4,
          expMonth: summary.expMonth,
          expYear: summary.expYear,
        },
      };
    }

    // 4) No existing card: create a SetupIntent (single-use) for Payment Element
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      usage: "off_session",
      payment_method_types: ["card"],
      metadata: { uid },
    });

    if (!setupIntent.client_secret) {
      throw new HttpsError(
        "internal",
        "Stripe SetupIntent did not return a client secret.",
      );
    }

    return {
      stripeCustomerId,
      clientSecret: setupIntent.client_secret,
      defaultPaymentMethodId: "",
      card: null,
    };
  },
);

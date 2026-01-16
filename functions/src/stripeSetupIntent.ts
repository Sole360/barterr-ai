import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import Stripe from "stripe";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");

type BillingDoc = {
  stripeCustomerId?: string;
  defaultPaymentMethodId?: string;
  updatedAt?: admin.firestore.FieldValue;
};

export const createSetupIntent = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
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

    let stripeCustomerId = billing.stripeCustomerId;

    // 1) Ensure Stripe customer exists
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        metadata: { uid },
      });

      stripeCustomerId = customer.id;

      await billingRef.set(
        {
          stripeCustomerId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    // 2) Create SetupIntent (saves payment method for later off-session charging)
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      usage: "off_session",
      payment_method_types: ["card"],
      metadata: { uid },
    });

    if (!setupIntent.client_secret) {
      throw new HttpsError(
        "internal",
        "Stripe SetupIntent did not return a client secret."
      );
    }

    return {
      clientSecret: setupIntent.client_secret,
      stripeCustomerId,
      // helpful to return if we already have one (frontend can skip UI later)
      defaultPaymentMethodId: billing.defaultPaymentMethodId ?? "",
    };
  }
);

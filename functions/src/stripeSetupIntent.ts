import { onRequest } from "firebase-functions/v2/https";
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

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://barterr.ai",
  "https://dev.barterr.ai",
];

export const createSetupIntent = onRequest(
  {
    region: "us-central1",
    secrets: [STRIPE_SECRET_KEY],
  },
  async (req, res) => {
    // Handle CORS
    const origin = req.headers.origin ?? "";
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.set("Access-Control-Allow-Origin", origin);
    }
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Credentials", "true");

    // Handle preflight
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      // Verify Firebase Auth token
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized - missing token" });
        return;
      }

      const idToken = authHeader.split("Bearer ")[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;

      const secret = STRIPE_SECRET_KEY.value();
      if (!secret) {
        res.status(500).json({ error: "Stripe is not configured" });
        return;
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
          { merge: true },
        );
      }

      // 2) If user already has a default payment method, return it
      if (billing.defaultPaymentMethodId) {
        res.json({
          defaultPaymentMethodId: billing.defaultPaymentMethodId,
        });
        return;
      }

      // 3) Create SetupIntent (saves payment method for later off-session charging)
      const setupIntent = await stripe.setupIntents.create({
        customer: stripeCustomerId,
        usage: "off_session",
        payment_method_types: ["card"],
        metadata: { uid },
      });

      if (!setupIntent.client_secret) {
        res.status(500).json({ error: "Failed to create SetupIntent" });
        return;
      }

      res.json({
        clientSecret: setupIntent.client_secret,
        stripeCustomerId,
        defaultPaymentMethodId: "",
      });
    } catch (error) {
      console.error("createSetupIntent error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

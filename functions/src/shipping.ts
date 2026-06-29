import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import axios from "axios";

const SHIPPO_API_KEY = defineSecret("SHIPPO_API_KEY");

// Admin UID (Barterr/Sole360 operator)
const ADMIN_UID = "Vu6dB5O5zKYExw3kpVxbGy0OZ3B2";

// Standard shoebox dimensions
const SHOEBOX_PARCEL = {
  length: "13",
  width: "8",
  height: "5",
  distance_unit: "in",
  weight: "2",
  mass_unit: "lb",
};

interface ShippoAddress {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
}

interface ShippoRate {
  object_id: string;
  amount: string;
  currency: string;
  provider: string;
  servicelevel: { name: string; token: string };
  estimated_days?: number;
  provider_image_75?: string;
}

interface ShippoTransaction {
  status: string;
  tracking_number: string;
  label_url: string;
  tracking_url_provider: string;
  messages?: { source: string; code: string; text: string }[];
}

function shippoApi(apiKey: string) {
  return axios.create({
    baseURL: "https://api.goshippo.com",
    headers: {
      Authorization: `ShippoToken ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Reads Barterr's facility address from `config/shipping` in Firestore.
 * Falls back to a hardcoded default only if the config doc is missing.
 * Update the doc via Firebase console or the admin panel — no redeploy needed.
 */
async function getBarterrAddress(
  db: FirebaseFirestore.Firestore,
): Promise<ShippoAddress> {
  const snap = await db.doc("config/shipping").get();
  if (snap.exists) {
    const data = snap.data()!;
    if (data.barterrAddress) return data.barterrAddress as ShippoAddress;
  }
  // Fallback — should only hit if config doc hasn't been seeded yet
  return {
    name: "Terrence Whaley",
    company: "Barterr",
    street1: "1932 Clinton St",
    city: "Los Angeles",
    state: "CA",
    zip: "90026",
    country: "US",
    phone: "7192135621",
    email: "terrence@barterr.ai",
  };
}

/**
 * Purchase a Shippo label for a given shipment, auto-selecting the best rate.
 * Prefers USPS Priority Mail; otherwise picks the cheapest available rate.
 */
async function purchaseBestRate(
  api: ReturnType<typeof shippoApi>,
  rates: ShippoRate[],
): Promise<{ transaction: ShippoTransaction; rate: ShippoRate }> {
  const sorted = [...rates].sort(
    (a, b) => parseFloat(a.amount) - parseFloat(b.amount),
  );

  const preferred =
    sorted.find(
      (r) => r.provider === "USPS" && r.servicelevel.token === "usps_priority",
    ) ?? sorted[0];

  if (!preferred)
    throw new HttpsError("internal", "No shipping rates available");

  const response = await api.post<ShippoTransaction>("/transactions/", {
    rate: preferred.object_id,
    label_file_type: "PDF",
    async: false,
  });

  const tx = response.data;
  if (tx.status !== "SUCCESS") {
    const errText =
      tx.messages?.map((m) => m.text).join(", ") || "Label purchase failed";
    throw new HttpsError("internal", errText);
  }

  return { transaction: tx, rate: preferred };
}

// ─────────────────────────────────────────────────────────────────────────────
// User-facing callable functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get shipping rates for the current user to ship their sneakers to Barterr.
 * Called after trade status = "completed". Barterr address is read from
 * config/shipping so it can be updated from the admin panel without redeploying.
 */
export const createShippoLabel = onCall(
  { region: "us-central1", secrets: [SHIPPO_API_KEY] },
  async (req) => {
    if (!req.auth?.uid) {
      throw new HttpsError("unauthenticated", "Must be signed in");
    }

    const { tradeId } = req.data as { tradeId: string };
    if (!tradeId) throw new HttpsError("invalid-argument", "tradeId required");

    const db = admin.firestore();

    const tradeSnap = await db.doc(`trades/${tradeId}`).get();
    if (!tradeSnap.exists) throw new HttpsError("not-found", "Trade not found");
    const trade = tradeSnap.data()!;

    const isSender = req.auth.uid === trade.fromUserId;
    const isPoster = req.auth.uid === trade.toUserId;
    if (!isSender && !isPoster) {
      throw new HttpsError("permission-denied", "Not your trade");
    }

    if (trade.status !== "completed") {
      throw new HttpsError(
        "failed-precondition",
        "Trade must be completed before getting a shipping label",
      );
    }

    const [userSnap, barterrAddress, authUser] = await Promise.all([
      db.doc(`users/${req.auth.uid}`).get(),
      getBarterrAddress(db),
      admin.auth().getUser(req.auth.uid),
    ]);

    const user = userSnap.data()!;
    const addr = user.address;
    if (!addr?.street) {
      throw new HttpsError(
        "failed-precondition",
        "No address on file. Please add your address in profile settings.",
      );
    }

    const api = shippoApi(SHIPPO_API_KEY.value());

    const response = await api.post<{ object_id: string; rates: ShippoRate[] }>(
      "/shipments/",
      {
        address_from: {
          name: user.displayName || `${user.firstName} ${user.lastName}`,
          street1: addr.street,
          street2: addr.street2 || "",
          city: addr.city,
          state: addr.state,
          zip: addr.zip,
          country: "US",
          email: authUser.email ?? "terrence@barterr.ai",
          phone: user.phone || "",
        },
        address_to: barterrAddress,
        parcels: [SHOEBOX_PARCEL],
        async: false,
      },
    );

    const rates: ShippoRate[] = response.data.rates
      .filter((r) => r.amount && r.provider)
      .sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount))
      .slice(0, 6);

    return { rates, shipmentObjectId: response.data.object_id };
  },
);

/**
 * Purchase a specific shipping label (rate chosen by the user) and store
 * tracking info on the order document.
 */
export const createShippoTransaction = onCall(
  { region: "us-central1", secrets: [SHIPPO_API_KEY] },
  async (req) => {
    if (!req.auth?.uid) {
      throw new HttpsError("unauthenticated", "Must be signed in");
    }

    const { tradeId, rateObjectId, carrier } = req.data as {
      tradeId: string;
      rateObjectId: string;
      carrier: string;
    };

    if (!tradeId || !rateObjectId) {
      throw new HttpsError(
        "invalid-argument",
        "tradeId and rateObjectId required",
      );
    }

    const db = admin.firestore();

    const tradeSnap = await db.doc(`trades/${tradeId}`).get();
    if (!tradeSnap.exists) throw new HttpsError("not-found", "Trade not found");
    const trade = tradeSnap.data()!;

    const isSender = req.auth.uid === trade.fromUserId;
    const isPoster = req.auth.uid === trade.toUserId;
    if (!isSender && !isPoster) {
      throw new HttpsError("permission-denied", "Not your trade");
    }

    const api = shippoApi(SHIPPO_API_KEY.value());

    const response = await api.post<ShippoTransaction>("/transactions/", {
      rate: rateObjectId,
      label_file_type: "PDF",
      async: false,
    });

    const tx = response.data;
    if (tx.status !== "SUCCESS") {
      const errText =
        tx.messages?.map((m) => m.text).join(", ") || "Label purchase failed";
      throw new HttpsError("internal", errText);
    }

    const trackingInfo = {
      carrier: carrier || "USPS",
      tracking: tx.tracking_number,
      label: tx.label_url,
    };

    const updateField = isSender ? "trackingSender" : "trackingPoster";
    await db.doc(`orders/${tradeId}`).update({ [updateField]: trackingInfo });

    return trackingInfo;
  },
);

/**
 * One-shot: create a Shippo shipment, auto-select the best rate, purchase the
 * label, and store tracking on the order — no rate picker needed in the UI.
 */
export const purchaseShippoLabel = onCall(
  { region: "us-central1", secrets: [SHIPPO_API_KEY] },
  async (req) => {
    if (!req.auth?.uid) {
      throw new HttpsError("unauthenticated", "Must be signed in");
    }

    const { tradeId } = req.data as { tradeId: string };
    if (!tradeId) throw new HttpsError("invalid-argument", "tradeId required");

    const db = admin.firestore();

    const tradeSnap = await db.doc(`trades/${tradeId}`).get();
    if (!tradeSnap.exists) throw new HttpsError("not-found", "Trade not found");
    const trade = tradeSnap.data()!;

    const isSender = req.auth.uid === trade.fromUserId;
    const isPoster = req.auth.uid === trade.toUserId;
    if (!isSender && !isPoster) {
      throw new HttpsError("permission-denied", "Not your trade");
    }

    if (trade.status !== "completed") {
      throw new HttpsError(
        "failed-precondition",
        "Trade must be completed before getting a shipping label",
      );
    }

    const [userSnap, barterrAddress, authUser] = await Promise.all([
      db.doc(`users/${req.auth.uid}`).get(),
      getBarterrAddress(db),
      admin.auth().getUser(req.auth.uid),
    ]);

    const user = userSnap.data()!;
    const addr = user.address;
    if (!addr?.street) {
      throw new HttpsError(
        "failed-precondition",
        "No address on file. Please add your address in profile settings.",
      );
    }

    const api = shippoApi(SHIPPO_API_KEY.value());

    const shipmentResponse = await api.post<{
      object_id: string;
      rates: ShippoRate[];
    }>("/shipments/", {
      address_from: {
        name: user.displayName || `${user.firstName} ${user.lastName}`,
        street1: addr.street,
        street2: addr.street2 || "",
        city: addr.city,
        state: addr.state,
        zip: addr.zip,
        country: "US",
        email: authUser.email ?? "terrence@barterr.ai",
        phone: authUser.phoneNumber ?? user.phone ?? "",
      },
      address_to: barterrAddress,
      parcels: [SHOEBOX_PARCEL],
      async: false,
    });

    const { transaction, rate } = await purchaseBestRate(
      api,
      shipmentResponse.data.rates,
    );

    const trackingInfo = {
      carrier: rate.provider,
      tracking: transaction.tracking_number,
      label: transaction.label_url,
    };

    const updateField = isSender ? "trackingSender" : "trackingPoster";
    await db.doc(`orders/${tradeId}`).update({ [updateField]: trackingInfo });

    return trackingInfo;
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Firestore trigger: create order when trade payments are captured
// ─────────────────────────────────────────────────────────────────────────────

/**
 * When a trade reaches "completed" (both payments captured), create a
 * corresponding order document to drive the shipping + auth pipeline.
 */
export const onTradeCompleted = onDocumentUpdated(
  { document: "trades/{tradeId}", region: "us-central1" },
  async (event) => {
    if (!event.data) {
      console.log("[onTradeCompleted] no event.data, skipping");
      return;
    }
    const before = event.data.before.data();
    const after = event.data.after.data();
    const tradeId = event.params.tradeId;

    console.log(
      `[onTradeCompleted] tradeId=${tradeId} before.status=${before?.status} after.status=${after?.status}`,
    );

    if (!before || !after) {
      console.log("[onTradeCompleted] missing before/after data, skipping");
      return;
    }
    if (before.status === "completed") {
      console.log(
        "[onTradeCompleted] before.status already completed, skipping",
      );
      return;
    }
    if (after.status !== "completed") {
      console.log(
        `[onTradeCompleted] after.status is '${after.status}', not completed, skipping`,
      );
      return;
    }

    const db = admin.firestore();

    // Idempotency guard
    const existing = await db.doc(`orders/${tradeId}`).get();
    if (existing.exists) {
      console.log(
        `[onTradeCompleted] orders/${tradeId} already exists, skipping`,
      );
      return;
    }
    console.log(`[onTradeCompleted] creating orders/${tradeId}`);

    const [senderSnap, posterSnap] = await Promise.all([
      db.doc(`users/${after.fromUserId}`).get(),
      db.doc(`users/${after.toUserId}`).get(),
    ]);

    const s = senderSnap.data()!;
    const p = posterSnap.data()!;

    await db.doc(`orders/${tradeId}`).set({
      id: tradeId,
      tradeId,
      fromUserId: after.fromUserId,
      toUserId: after.toUserId,
      sender: {
        id: after.fromUserId,
        name: s.displayName || `${s.firstName} ${s.lastName}`,
        email: s.email,
        sneakerReceived: false,
        authenticated: false,
      },
      poster: {
        id: after.toUserId,
        name: p.displayName || `${p.firstName} ${p.lastName}`,
        email: p.email,
        sneakerReceived: false,
        authenticated: false,
      },
      users: [after.fromUserId, after.toUserId],
      tradeDeal: {
        senderOffer: {
          sneakers: after.yourItems ?? [],
          cash: after.addCash ?? 0,
        },
        posterOffer: {
          sneakers: after.theirItems ?? [],
          cash: after.askCash ?? 0,
        },
      },
      confirmedAt: FieldValue.serverTimestamp(),
      completed: false,
    });
    console.log(`[onTradeCompleted] orders/${tradeId} created successfully`);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Admin-only callable functions (checked at runtime; Firestore rules block
// all direct client writes to orders so a second layer isn't needed there)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Admin: mark that Barterr physically received sneakers from one party.
 * Fires the onSneakersReceived email trigger.
 */
export const markSneakersReceived = onCall(
  { region: "us-central1" },
  async (req) => {
    if (!req.auth?.uid)
      throw new HttpsError("unauthenticated", "Must be signed in");
    if (req.auth.uid !== ADMIN_UID)
      throw new HttpsError("permission-denied", "Admin only");

    const { tradeId, role } = req.data as {
      tradeId: string;
      role: "sender" | "poster";
    };
    if (!tradeId || !role) {
      throw new HttpsError("invalid-argument", "tradeId and role required");
    }

    await admin
      .firestore()
      .doc(`orders/${tradeId}`)
      .update({
        [`${role}.sneakerReceived`]: true,
      });

    return { success: true };
  },
);

/**
 * Admin: record the authentication result for one side of the trade.
 * - passed=false → writes `fakes` field (fires onFakeShoes email)
 * - passed=true  → marks that side authenticated; if both pass → completed=true
 */
export const markAuthResult = onCall({ region: "us-central1" }, async (req) => {
  if (!req.auth?.uid)
    throw new HttpsError("unauthenticated", "Must be signed in");
  if (req.auth.uid !== ADMIN_UID)
    throw new HttpsError("permission-denied", "Admin only");

  const { tradeId, role, passed, reasons } = req.data as {
    tradeId: string;
    role: "sender" | "poster";
    passed: boolean;
    reasons?: string;
  };
  if (!tradeId || !role) {
    throw new HttpsError("invalid-argument", "tradeId and role required");
  }

  const db = admin.firestore();
  const orderRef = db.doc(`orders/${tradeId}`);

  if (!passed) {
    const order = (await orderRef.get()).data()!;
    const failedUserId =
      role === "sender" ? order.sender?.id : order.poster?.id;
    await orderRef.update({
      fakes: { userId: failedUserId, reasons: reasons || "" },
    });
    return { success: true };
  }

  await orderRef.update({ [`${role}.authenticated`]: true });

  const order = (await orderRef.get()).data()!;
  if (order.sender?.authenticated && order.poster?.authenticated) {
    await orderRef.update({ completed: true });
  }

  return { success: true };
});

/**
 * Admin: generate an outbound Shippo label from Barterr's facility to a
 * trade participant's address. Called once for each side after both sets of
 * sneakers pass authentication. Auto-selects the best available rate
 * (prefers USPS Priority, otherwise cheapest).
 *
 * `recipient` = "sender" → ship to the original sender's address
 *             = "poster" → ship to the original poster's address
 *
 * Stored on the order as `senderOutbound` or `posterOutbound`.
 * Fires the onOutboundLabelCreated email trigger.
 */
export const createOutboundLabel = onCall(
  { region: "us-central1", secrets: [SHIPPO_API_KEY] },
  async (req) => {
    if (!req.auth?.uid)
      throw new HttpsError("unauthenticated", "Must be signed in");
    if (req.auth.uid !== ADMIN_UID)
      throw new HttpsError("permission-denied", "Admin only");

    const { tradeId, recipient } = req.data as {
      tradeId: string;
      recipient: "sender" | "poster";
    };
    if (!tradeId || !recipient) {
      throw new HttpsError(
        "invalid-argument",
        "tradeId and recipient required",
      );
    }

    const db = admin.firestore();
    const orderSnap = await db.doc(`orders/${tradeId}`).get();
    if (!orderSnap.exists) throw new HttpsError("not-found", "Order not found");
    const order = orderSnap.data()!;

    if (!order.sender?.authenticated || !order.poster?.authenticated) {
      throw new HttpsError(
        "failed-precondition",
        "Both sides must pass authentication before outbound labels can be generated",
      );
    }

    const recipientUserId =
      recipient === "sender" ? order.fromUserId : order.toUserId;

    const [userSnap, barterrAddress] = await Promise.all([
      db.doc(`users/${recipientUserId}`).get(),
      getBarterrAddress(db),
    ]);

    const user = userSnap.data()!;
    const addr = user.address;
    if (!addr?.street) {
      throw new HttpsError(
        "failed-precondition",
        `${recipient} has no address on file`,
      );
    }

    const api = shippoApi(SHIPPO_API_KEY.value());

    const shipmentResponse = await api.post<{
      object_id: string;
      rates: ShippoRate[];
    }>("/shipments/", {
      address_from: barterrAddress,
      address_to: {
        name: user.displayName || `${user.firstName} ${user.lastName}`,
        street1: addr.street,
        street2: addr.street2 || "",
        city: addr.city,
        state: addr.state,
        zip: addr.zip,
        country: "US",
      },
      parcels: [SHOEBOX_PARCEL],
      async: false,
    });

    const { transaction, rate } = await purchaseBestRate(
      api,
      shipmentResponse.data.rates,
    );

    const trackingInfo = {
      carrier: rate.provider,
      tracking: transaction.tracking_number,
      label: transaction.label_url,
    };

    const updateField =
      recipient === "sender" ? "senderOutbound" : "posterOutbound";
    await db.doc(`orders/${tradeId}`).update({ [updateField]: trackingInfo });

    return trackingInfo;
  },
);

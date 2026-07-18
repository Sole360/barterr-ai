import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import axios from "axios";
import sgMail from "@sendgrid/mail";
import { writeAuditLog } from "./utils/auditLog";

const SHIPPO_API_KEY = defineSecret("SHIPPO_API_KEY");
const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");

const FROM = "trading@barterr.ai";

const TEMPLATES = {
  AUTH_ISSUE_NOTICE: "d-e7bf1f33e36a45c58c4d2e18431c9b5a",
} as const;

const CORS_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://barterr.ai",
  "https://dev.barterr.ai",
];

// Admin UID (Barterr/Sole360 operator)
function assertAdmin(req: { auth?: { uid: string; token: Record<string, unknown> } | null }) {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Must be signed in");
  const role = req.auth.token?.role as string | undefined;
  if (role !== "admin" && role !== "super_admin") {
    throw new HttpsError("permission-denied", "Admin only");
  }
}

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
const BARTERR_ADDRESS_DEFAULTS: ShippoAddress = {
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

async function getBarterrAddress(
  db: FirebaseFirestore.Firestore,
): Promise<ShippoAddress> {
  const snap = await db.doc("config/shipping").get();
  if (snap.exists) {
    const data = snap.data()!;
    // Merge with defaults so required fields (email, phone) are always present
    // even if the Firestore config doc was seeded without them.
    if (data.barterrAddress) return { ...BARTERR_ADDRESS_DEFAULTS, ...data.barterrAddress };
  }
  return BARTERR_ADDRESS_DEFAULTS;
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

  let response: Awaited<ReturnType<typeof api.post<ShippoTransaction>>>;
  try {
    response = await api.post<ShippoTransaction>("/transactions/", {
      rate: preferred.object_id,
      label_file_type: "PDF",
      async: false,
    });
  } catch (err: any) {
    logger.error("[purchaseBestRate] Shippo transaction API error", {
      rateId: preferred.object_id,
      provider: preferred.provider,
      shippoError: err.response?.data ?? err.message,
    });
    throw new HttpsError("internal", "Failed to purchase shipping label. Please try again.");
  }

  const tx = response.data;
  if (tx.status !== "SUCCESS") {
    logger.error("[purchaseBestRate] transaction not successful", {
      status: tx.status,
      messages: tx.messages,
    });
    const errText = tx.messages?.map((m) => m.text).join(", ") || "Label purchase failed";
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
  { region: "us-central1", secrets: [SHIPPO_API_KEY], cors: CORS_ORIGINS, invoker: "public" },
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
          email: authUser?.email || user?.email || "",
          phone: authUser?.phoneNumber || user?.phone || "",
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
  { region: "us-central1", secrets: [SHIPPO_API_KEY], cors: CORS_ORIGINS, invoker: "public" },
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
  { region: "us-central1", secrets: [SHIPPO_API_KEY], cors: CORS_ORIGINS, invoker: "public" },
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

    const [userSnap, barterrAddress] = await Promise.all([
      db.doc(`users/${req.auth.uid}`).get(),
      getBarterrAddress(db),
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

    // Create an explicit Shippo address object so Shippo stores the email.
    // Passing inline addresses lets Shippo deduplicate against previously created
    // shipments that may have been created without email — using a fresh object_id
    // forces a new shipment and guarantees the email is present.
    let addrFromId: string;
    try {
      const addrResp = await api.post<{ object_id: string }>("/addresses/", {
        name: user.displayName || `${user.firstName} ${user.lastName}`,
        street1: addr.street,
        street2: addr.street2 || "",
        city: addr.city,
        state: addr.state,
        zip: addr.zip,
        country: "US",
        email: user.email,
        phone: user.mobile || user.phone || "",
      });
      addrFromId = addrResp.data.object_id;
    } catch (err: any) {
      logger.error("[purchaseShippoLabel] address creation failed", {
        tradeId,
        uid: req.auth.uid,
        shippoError: err.response?.data ?? err.message,
      });
      await writeAuditLog({
        eventType: "label.inbound_created",
        functionName: "purchaseShippoLabel",
        actorId: req.auth.uid,
        targetId: tradeId,
        targetType: "trade",
        status: "failure",
        durationMs: 0,
        metadata: { role: isSender ? "sender" : "poster", step: "address_creation", error: err.response?.data ?? err.message },
      });
      throw new HttpsError("internal", "Failed to create shipping address. Please try again.");
    }

    let rates: ShippoRate[];
    try {
      const shipmentResp = await api.post<{
        object_id: string;
        rates: ShippoRate[];
        status?: string;
      }>("/shipments/", {
        address_from: addrFromId,
        address_to: barterrAddress,
        parcels: [SHOEBOX_PARCEL],
        async: false,
      });
      rates = shipmentResp.data.rates;
      if (!rates?.length) {
        logger.error("[purchaseShippoLabel] no rates returned", { tradeId });
        throw new HttpsError("internal", "No shipping rates available for your address.");
      }
    } catch (err: any) {
      if (err instanceof HttpsError) throw err;
      logger.error("[purchaseShippoLabel] shipment creation failed", {
        tradeId,
        shippoError: err.response?.data ?? err.message,
      });
      await writeAuditLog({
        eventType: "label.inbound_created",
        functionName: "purchaseShippoLabel",
        actorId: req.auth.uid,
        targetId: tradeId,
        targetType: "trade",
        status: "failure",
        durationMs: 0,
        metadata: { role: isSender ? "sender" : "poster", step: "shipment_creation", error: err.response?.data ?? err.message },
      });
      throw new HttpsError("internal", "Failed to get shipping rates. Please try again.");
    }

    let transaction: ShippoTransaction;
    let rate: ShippoRate;
    try {
      ({ transaction, rate } = await purchaseBestRate(api, rates));
    } catch (err: any) {
      logger.error("[purchaseShippoLabel] label purchase failed", { tradeId, error: err.message });
      await writeAuditLog({
        eventType: "label.inbound_created",
        functionName: "purchaseShippoLabel",
        actorId: req.auth.uid,
        targetId: tradeId,
        targetType: "trade",
        status: "failure",
        durationMs: 0,
        metadata: { role: isSender ? "sender" : "poster", step: "label_purchase", error: err.message },
      });
      throw err instanceof HttpsError ? err : new HttpsError("internal", "Failed to purchase shipping label. Please try again.");
    }

    const trackingInfo = {
      carrier: rate.provider,
      tracking: transaction.tracking_number,
      label: transaction.label_url,
    };

    const updateField = isSender ? "trackingSender" : "trackingPoster";
    await db.doc(`orders/${tradeId}`).update({ [updateField]: trackingInfo });

    await writeAuditLog({
      eventType: "label.inbound_created",
      functionName: "purchaseShippoLabel",
      actorId: req.auth.uid,
      targetId: tradeId,
      targetType: "trade",
      status: "success",
      durationMs: 0,
      metadata: { role: isSender ? "sender" : "poster", carrier: trackingInfo.carrier, tracking: trackingInfo.tracking },
    });

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

    await writeAuditLog({
      eventType: "trade.completed",
      functionName: "onTradeCompleted",
      actorId: "system",
      targetId: tradeId,
      targetType: "order",
      status: "success",
      durationMs: 0,
      metadata: { fromUserId: after.fromUserId, toUserId: after.toUserId },
    });
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
  { region: "us-central1", cors: CORS_ORIGINS, invoker: "public" },
  async (req) => {
    if (!req.auth?.uid)
      throw new HttpsError("unauthenticated", "Must be signed in");
    assertAdmin(req);

    const { tradeId, role } = req.data as {
      tradeId: string;
      role: "sender" | "poster";
    };
    if (!tradeId || !role) {
      throw new HttpsError("invalid-argument", "tradeId and role required");
    }

    const orderSnap = await admin.firestore().doc(`orders/${tradeId}`).get();
    if (!orderSnap.exists) throw new HttpsError("not-found", "Order not found");
    const order = orderSnap.data()!;

    const trackingField = role === "sender" ? "trackingSender" : "trackingPoster";
    if (!order[trackingField]?.tracking) {
      throw new HttpsError(
        "failed-precondition",
        `Cannot mark ${role} sneakers received — no inbound shipping label exists yet.`
      );
    }

    try {
      await admin.firestore().doc(`orders/${tradeId}`).update({ [`${role}.sneakerReceived`]: true });
    } catch (err: any) {
      await writeAuditLog({
        eventType: "auth.sneakers_received",
        functionName: "markSneakersReceived",
        actorId: req.auth.uid,
        targetId: tradeId,
        targetType: "order",
        status: "failure",
        durationMs: 0,
        metadata: { role, error: err.message },
      });
      throw new HttpsError("internal", "Failed to mark sneakers received.");
    }

    await writeAuditLog({
      eventType: "auth.sneakers_received",
      functionName: "markSneakersReceived",
      actorId: req.auth.uid,
      targetId: tradeId,
      targetType: "order",
      status: "success",
      durationMs: 0,
      metadata: { role },
    });

    return { success: true };
  },
);

/**
 * Admin: record the authentication result for one side of the trade.
 * - passed=false → writes `fakes` field (fires onFakeShoes email)
 * - passed=true  → marks that side authenticated; if both pass → completed=true
 */
export const markAuthResult = onCall({ region: "us-central1", secrets: [SENDGRID_API_KEY], cors: CORS_ORIGINS, invoker: "public" }, async (req) => {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Must be signed in");
  assertAdmin(req);

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

  try {
    if (!passed) {
      const order = (await orderRef.get()).data()!;
      const failedUserId = role === "sender" ? order.sender?.id : order.poster?.id;
      await orderRef.update({ fakes: { userId: failedUserId, reasons: reasons || "" } });

      // Notify the legitimate party (the one whose sneakers are NOT fake)
      const legitId    = role === "sender" ? order.poster?.id    : order.sender?.id;
      const legitEmail = role === "sender" ? order.poster?.email : order.sender?.email;
      const legitName  = role === "sender" ? order.poster?.name  : order.sender?.name;

      if (legitId) {
        await db.collection("users").doc(legitId).collection("notifications").add({
          type: "auth_issue",
          title: "Authentication Issue",
          body: "We've detected a potential issue with the other party's sneakers. We're investigating — your sneakers are safe.",
          data: { tradeId },
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }).catch((err) => logger.error("[markAuthResult] auth_issue notification failed", err));
      }

      if (legitEmail && !TEMPLATES.AUTH_ISSUE_NOTICE.startsWith("PLACEHOLDER")) {
        sgMail.setApiKey(SENDGRID_API_KEY.value());
        await sgMail.send({
          to: legitEmail,
          from: FROM,
          subject: "Important Update on Your Barterr Trade",
          templateId: TEMPLATES.AUTH_ISSUE_NOTICE,
          dynamicTemplateData: { firstName: (legitName ?? "there").split(" ")[0] },
        }).catch((err) => logger.error("[markAuthResult] legitimate party email failed", err));
      }

      await writeAuditLog({
        eventType: "auth.result",
        functionName: "markAuthResult",
        actorId: req.auth.uid,
        targetId: tradeId,
        targetType: "order",
        status: "success",
        durationMs: 0,
        metadata: { role, passed: false, reasons: reasons || "" },
      });
      return { success: true };
    }

    await orderRef.update({ [`${role}.authenticated`]: true });
    const order = (await orderRef.get()).data()!;
    if (order.sender?.authenticated && order.poster?.authenticated) {
      await orderRef.update({ completed: true });
    }

    await writeAuditLog({
      eventType: "auth.result",
      functionName: "markAuthResult",
      actorId: req.auth.uid,
      targetId: tradeId,
      targetType: "order",
      status: "success",
      durationMs: 0,
      metadata: { role, passed: true },
    });

    return { success: true };
  } catch (err: any) {
    if (err instanceof HttpsError) throw err;
    await writeAuditLog({
      eventType: "auth.result",
      functionName: "markAuthResult",
      actorId: req.auth.uid,
      targetId: tradeId,
      targetType: "order",
      status: "failure",
      durationMs: 0,
      metadata: { role, passed, error: err.message },
    });
    throw new HttpsError("internal", "Failed to record auth result.");
  }
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
  { region: "us-central1", secrets: [SHIPPO_API_KEY], cors: CORS_ORIGINS, invoker: "public" },
  async (req) => {
    if (!req.auth?.uid)
      throw new HttpsError("unauthenticated", "Must be signed in");
    assertAdmin(req);

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

    let trackingInfo: { carrier: string; tracking: string; label: string };
    try {
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

      const { transaction, rate } = await purchaseBestRate(api, shipmentResponse.data.rates);
      trackingInfo = { carrier: rate.provider, tracking: transaction.tracking_number, label: transaction.label_url };
    } catch (err: any) {
      logger.error("[createOutboundLabel] Shippo error", { tradeId, recipient, error: err.message });
      await writeAuditLog({
        eventType: "label.outbound_created",
        functionName: "createOutboundLabel",
        actorId: req.auth.uid,
        targetId: tradeId,
        targetType: "order",
        status: "failure",
        durationMs: 0,
        metadata: { recipient, error: err instanceof HttpsError ? err.message : (err.response?.data ?? err.message) },
      });
      throw err instanceof HttpsError ? err : new HttpsError("internal", "Failed to generate outbound label. Please try again.");
    }

    const updateField = recipient === "sender" ? "senderOutbound" : "posterOutbound";
    await db.doc(`orders/${tradeId}`).update({ [updateField]: trackingInfo });

    await writeAuditLog({
      eventType: "label.outbound_created",
      functionName: "createOutboundLabel",
      actorId: req.auth.uid,
      targetId: tradeId,
      targetType: "order",
      status: "success",
      durationMs: 0,
      metadata: { recipient, carrier: trackingInfo.carrier, tracking: trackingInfo.tracking },
    });

    return trackingInfo;
  },
);

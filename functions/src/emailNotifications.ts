import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import sgMail from "@sendgrid/mail";

const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");

const FROM = "trading@barterr.ai";
const APP_URL = "https://barterr.ai";

const TEMPLATES = {
  NEW_TRADE:         "d-bfc35994bec2403884ccd5ad3b982597",
  TRADE_CONFIRMED:   "d-431bfa5fd20b43949cb75bbea41b43d6",
  TRADE_DECLINED:    "d-959b48870d4441e5ac21d96f4911d60f",
  REMINDER:          "d-2add3c5197bd49698986dfc78186b756",
  DIRECT_MESSAGE:    "d-47cf05390b42487bbfb297a6bf926671",
  WISHLIST_MATCH:    "d-b2f6b0f126924a58b5110f1a700807c3",
  LISTING_MATCH:     "d-655516256eab4802aba2def33157bd4b",
  COUNTERFEIT:       "d-9f5cc287b9c04c1d90ae5c2410087c02",
  SHIPPING_LABEL:    "d-3569137469c14e408306d6d3cfff6b35",
  SNEAKERS_RECEIVED: "d-3c23330086b24ca6822c5b2e350862a8",
  OUTBOUND_LABEL:    "d-c735c35ebfb848d484db72a8716e9958",
} as const;

// ─────────────────────────────────────────────
// Local types (kept inline to avoid cross-
// package imports from the frontend src/)
// ─────────────────────────────────────────────

type TradeStatus =
  | "pending"
  | "both_confirmed"
  | "processing"
  | "completed"
  | "failed"
  | "declined";

interface TradeDoc {
  fromUserId: string;
  toUserId: string;
  status: TradeStatus;
  likelihood: number;
  addCash: number;
  askCash: number;
  receiverRead: boolean;
  yourItems: Array<{
    name: string;
    size: string;
    value: string;
    imageUrl: string;
  }>;
  theirItems: Array<{
    title: string;
    size: number;
    tradeValue: number;
    imageUrl: string;
  }>;
}

interface UserProfile {
  email: string;
  firstName?: string;
  displayName?: string;
}

interface WisherOwner {
  displayName: string;
  email: string;
  size: number;
}

interface PostDoc {
  postId: string;
  title: string;
  brand: string;
  productImageUrl: string;
  wishers?: WisherOwner[];
  owners?: WisherOwner[];
}

interface UserRef {
  id: string;
  name: string;
  email: string;
  sneakerReceived?: boolean;
}

interface TrackingInfo {
  carrier: string;
  tracking: string;
  label: string;
}

interface OrderDoc {
  id: string;
  poster: UserRef;
  sender: UserRef;
  fakes?: { userId: string; reasons: string };
  trackingSender?: TrackingInfo;
  trackingPoster?: TrackingInfo;
  // Outbound: Barterr → each party after authentication
  senderOutbound?: TrackingInfo;
  posterOutbound?: TrackingInfo;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function setup() {
  const key = SENDGRID_API_KEY.value();
  if (!key) throw new Error("SENDGRID_API_KEY secret is not set.");
  sgMail.setApiKey(key);
}

async function getUser(uid: string): Promise<UserProfile | undefined> {
  const snap = await admin.firestore().collection("users").doc(uid).get();
  return snap.data() as UserProfile | undefined;
}

function firstName(user: UserProfile): string {
  return user.firstName ?? user.displayName ?? "there";
}

function displayName(user: UserProfile): string {
  return user.displayName ?? user.firstName ?? "your trade partner";
}

// ─────────────────────────────────────────────
// 1. New trade offer → receiver
// ─────────────────────────────────────────────

export const onNewTrade = onDocumentCreated(
  { document: "trades/{tradeId}", secrets: [SENDGRID_API_KEY] },
  async (event) => {
    setup();
    const tradeId = event.params.tradeId;
    const trade = event.data?.data() as TradeDoc | undefined;
    if (!trade) return;

    const [sender, receiver] = await Promise.all([
      getUser(trade.fromUserId),
      getUser(trade.toUserId),
    ]);
    if (!receiver?.email || !sender) return;

    const offer = trade.yourItems?.[0];
    const want = trade.theirItems?.[0];

    await sgMail.send({
      to: receiver.email,
      from: FROM,
      subject: `${displayName(sender)} wants to trade with you`,
      templateId: TEMPLATES.NEW_TRADE,
      dynamicTemplateData: {
        receiverName: firstName(receiver),
        senderName: displayName(sender),
        likelihood: Math.round(trade.likelihood ?? 0),
        offerSneakerName: offer?.name ?? "",
        offerSneakerSize: offer?.size ?? "",
        offerSneakerValue: offer?.value ?? "",
        offerSneakerImage: offer?.imageUrl ?? "",
        wantSneakerName: want?.title ?? "",
        wantSneakerSize: want?.size ?? "",
        wantSneakerValue: want?.tradeValue ?? "",
        wantSneakerImage: want?.imageUrl ?? "",
        addCash: trade.addCash > 0 ? trade.addCash : null,
        askCash: trade.askCash > 0 ? trade.askCash : null,
        tradeUrl: `${APP_URL}/trades/${tradeId}`,
      },
    });

    await admin
      .firestore()
      .collection("users")
      .doc(trade.toUserId)
      .update({
        notification: true,
        numNotification: admin.firestore.FieldValue.increment(1),
      });
  }
);

// ─────────────────────────────────────────────
// 2. Trade confirmed / declined → both parties
// ─────────────────────────────────────────────

export const onTradeStatusChange = onDocumentUpdated(
  { document: "trades/{tradeId}", secrets: [SENDGRID_API_KEY] },
  async (event) => {
    setup();
    if (!event.data) return;
    const tradeId = event.params.tradeId;
    const before = event.data.before.data() as TradeDoc;
    const after = event.data.after.data() as TradeDoc;
    if (before.status === after.status) return;

    const [sender, receiver] = await Promise.all([
      getUser(after.fromUserId),
      getUser(after.toUserId),
    ]);
    if (!sender?.email || !receiver?.email) return;

    const tradeUrl = `${APP_URL}/trades/${tradeId}`;
    const inboxUrl = `${APP_URL}/trades`;

    if (after.status === "both_confirmed") {
      await Promise.all([
        sgMail.send({
          to: sender.email,
          from: FROM,
          subject: "Your trade is confirmed",
          templateId: TEMPLATES.TRADE_CONFIRMED,
          dynamicTemplateData: {
            firstName: firstName(sender),
            counterpartyName: displayName(receiver),
            tradeId,
            tradeUrl,
          },
        }),
        sgMail.send({
          to: receiver.email,
          from: FROM,
          subject: "Your trade is confirmed",
          templateId: TEMPLATES.TRADE_CONFIRMED,
          dynamicTemplateData: {
            firstName: firstName(receiver),
            counterpartyName: displayName(sender),
            tradeId,
            tradeUrl,
          },
        }),
      ]);
    }

    if (after.status === "declined") {
      await Promise.all([
        sgMail.send({
          to: sender.email,
          from: FROM,
          subject: "Trade update: offer declined",
          templateId: TEMPLATES.TRADE_DECLINED,
          dynamicTemplateData: {
            firstName: firstName(sender),
            counterpartyName: displayName(receiver),
            tradeId,
            inboxUrl,
          },
        }),
        sgMail.send({
          to: receiver.email,
          from: FROM,
          subject: "Trade update: offer declined",
          templateId: TEMPLATES.TRADE_DECLINED,
          dynamicTemplateData: {
            firstName: firstName(receiver),
            counterpartyName: displayName(sender),
            tradeId,
            inboxUrl,
          },
        }),
      ]);
    }
  }
);

// ─────────────────────────────────────────────
// 3. Weekly reminder — Monday 10 AM ET
//    Queries pending trades where receiver
//    hasn't read yet, sends one email per user
//    with their total pending count.
// ─────────────────────────────────────────────

export const sendWeeklyReminder = onSchedule(
  {
    schedule: "0 10 * * 1",
    timeZone: "America/New_York",
    secrets: [SENDGRID_API_KEY],
  },
  async () => {
    setup();
    const snap = await admin
      .firestore()
      .collection("trades")
      .where("status", "==", "pending")
      .where("receiverRead", "==", false)
      .get();

    const countByUser = new Map<string, number>();
    snap.forEach((doc) => {
      const t = doc.data() as TradeDoc;
      countByUser.set(t.toUserId, (countByUser.get(t.toUserId) ?? 0) + 1);
    });

    const sends: Promise<unknown>[] = [];
    for (const [uid, count] of countByUser) {
      const user = await getUser(uid);
      if (!user?.email) continue;
      sends.push(
        sgMail.send({
          to: user.email,
          from: FROM,
          subject: "You have pending trades on Barterr",
          templateId: TEMPLATES.REMINDER,
          dynamicTemplateData: {
            firstName: firstName(user),
            pendingCount: count,
            moreThanOne: count > 1,
            inboxUrl: `${APP_URL}/trades`,
          },
        })
      );
    }

    await Promise.all(sends);
  }
);

// ─────────────────────────────────────────────
// 4. Direct message (callable)
// ─────────────────────────────────────────────

export const sendEmailMessage = onCall(
  { secrets: [SENDGRID_API_KEY] },
  async (req) => {
    if (!req.auth?.uid) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    setup();
    const { email, message, recipientName, senderName, tradeId } =
      req.data ?? {};

    return sgMail.send({
      to: email,
      from: FROM,
      subject: `New message from ${senderName}`,
      templateId: TEMPLATES.DIRECT_MESSAGE,
      dynamicTemplateData: {
        recipientName,
        senderName,
        message,
        tradeUrl: `${APP_URL}/trades/${tradeId}`,
      },
    });
  }
);

// ─────────────────────────────────────────────
// 5. Post match
//    New owner listed → notify matching wishers
//    New wisher added → notify matching owners
// ─────────────────────────────────────────────

export const onMatchPostCriteria = onDocumentUpdated(
  { document: "posts/{postId}", secrets: [SENDGRID_API_KEY] },
  async (event) => {
    setup();
    if (!event.data) return;
    const before = event.data.before.data() as PostDoc;
    const after = event.data.after.data() as PostDoc;
    const sends: Promise<unknown>[] = [];

    const sneakerBase = {
      sneakerName: after.title,
      sneakerBrand: after.brand,
      sneakerImage: after.productImageUrl,
      postUrl: `${APP_URL}/?id=${after.postId}`,
    };

    // New owner → notify matching wishers
    if ((after.owners?.length ?? 0) > (before.owners?.length ?? 0)) {
      const newOwner = after.owners!.at(-1)!;
      for (const wisher of after.wishers ?? []) {
        if (wisher.email && Math.abs(wisher.size - newOwner.size) <= 1) {
          sends.push(
            sgMail.send({
              to: wisher.email,
              from: FROM,
              subject: `${after.title} just dropped in your size`,
              templateId: TEMPLATES.WISHLIST_MATCH,
              dynamicTemplateData: {
                firstName: wisher.displayName,
                sneakerSize: newOwner.size,
                ...sneakerBase,
              },
            })
          );
        }
      }
    }

    // New wisher → notify matching owners
    if ((after.wishers?.length ?? 0) > (before.wishers?.length ?? 0)) {
      const newWisher = after.wishers!.at(-1)!;
      for (const owner of after.owners ?? []) {
        if (owner.email && Math.abs(owner.size - newWisher.size) <= 1) {
          sends.push(
            sgMail.send({
              to: owner.email,
              from: FROM,
              subject: `Someone wants your ${after.title}`,
              templateId: TEMPLATES.LISTING_MATCH,
              dynamicTemplateData: {
                firstName: owner.displayName,
                sneakerSize: newWisher.size,
                ...sneakerBase,
              },
            })
          );
        }
      }
    }

    await Promise.all(sends);
  }
);

// ─────────────────────────────────────────────
// 6–8. Order-based (shipping flow)
// These trigger on the `orders` collection,
// which is created when the Shippo shipping
// flow is built. The OrderDoc type here mirrors
// what that schema will need — sneakerReceived
// lives directly on the sender/poster ref.
// ─────────────────────────────────────────────

export const onFakeShoes = onDocumentUpdated(
  { document: "orders/{orderId}", secrets: [SENDGRID_API_KEY] },
  async (event) => {
    setup();
    if (!event.data) return;
    const before = event.data.before.data() as OrderDoc;
    const after = event.data.after.data() as OrderDoc;
    if (before.fakes || !after.fakes) return;

    const isSender = after.fakes.userId === after.sender?.id;
    const user = isSender ? after.sender : after.poster;
    if (!user?.email) return;

    await sgMail.send({
      to: user.email,
      bcc: "terrence@barterr.ai",
      from: FROM,
      subject: "Important: Authentication issue with your trade",
      templateId: TEMPLATES.COUNTERFEIT,
      dynamicTemplateData: {
        firstName: user.name,
        reasons: after.fakes.reasons,
      },
    });
  }
);

export const onShippingLabelCreated = onDocumentUpdated(
  { document: "orders/{orderId}", secrets: [SENDGRID_API_KEY] },
  async (event) => {
    setup();
    if (!event.data) return;
    const before = event.data.before.data() as OrderDoc;
    const after = event.data.after.data() as OrderDoc;
    const sends: Promise<unknown>[] = [];
    const tradeUrl = `${APP_URL}/trades/${after.id}`;

    if (!before.trackingPoster && after.trackingPoster && after.poster?.email) {
      sends.push(
        sgMail.send({
          to: after.poster.email,
          from: FROM,
          subject: "Your shipping label is ready",
          templateId: TEMPLATES.SHIPPING_LABEL,
          dynamicTemplateData: {
            firstName: after.poster.name,
            otherName: after.sender?.name ?? "",
            carrier: after.trackingPoster.carrier,
            trackingNumber: after.trackingPoster.tracking,
            labelUrl: after.trackingPoster.label,
            tradeId: after.id,
            tradeUrl,
          },
        })
      );
    }

    if (!before.trackingSender && after.trackingSender && after.sender?.email) {
      sends.push(
        sgMail.send({
          to: after.sender.email,
          from: FROM,
          subject: "Your shipping label is ready",
          templateId: TEMPLATES.SHIPPING_LABEL,
          dynamicTemplateData: {
            firstName: after.sender.name,
            otherName: after.poster?.name ?? "",
            carrier: after.trackingSender.carrier,
            trackingNumber: after.trackingSender.tracking,
            labelUrl: after.trackingSender.label,
            tradeId: after.id,
            tradeUrl,
          },
        })
      );
    }

    await Promise.all(sends);
  }
);

export const onSneakersReceived = onDocumentUpdated(
  { document: "orders/{orderId}", secrets: [SENDGRID_API_KEY] },
  async (event) => {
    setup();
    if (!event.data) return;
    const before = event.data.before.data() as OrderDoc;
    const after = event.data.after.data() as OrderDoc;
    const sends: Promise<unknown>[] = [];
    const tradeUrl = `${APP_URL}/trades/${after.id}`;

    if (after.sender?.sneakerReceived && !before.sender?.sneakerReceived && after.sender.email) {
      sends.push(
        sgMail.send({
          to: after.sender.email,
          from: FROM,
          subject: "We've received your sneakers — authentication begins now",
          templateId: TEMPLATES.SNEAKERS_RECEIVED,
          dynamicTemplateData: {
            firstName: after.sender.name,
            otherName: after.poster?.name ?? "",
            tradeId: after.id,
            tradeUrl,
          },
        })
      );
    }

    if (after.poster?.sneakerReceived && !before.poster?.sneakerReceived && after.poster.email) {
      sends.push(
        sgMail.send({
          to: after.poster.email,
          from: FROM,
          subject: "We've received your sneakers — authentication begins now",
          templateId: TEMPLATES.SNEAKERS_RECEIVED,
          dynamicTemplateData: {
            firstName: after.poster.name,
            otherName: after.sender?.name ?? "",
            tradeId: after.id,
            tradeUrl,
          },
        })
      );
    }

    await Promise.all(sends);
  }
);

// Fires when Barterr generates an outbound label (senderOutbound or posterOutbound set).
export const onOutboundLabelCreated = onDocumentUpdated(
  { document: "orders/{orderId}", secrets: [SENDGRID_API_KEY] },
  async (event) => {
    setup();
    if (!event.data) return;
    const before = event.data.before.data() as OrderDoc;
    const after = event.data.after.data() as OrderDoc;
    const sends: Promise<unknown>[] = [];
    const tradeUrl = `${APP_URL}/trades/${after.id}`;

    if (!before.senderOutbound && after.senderOutbound && after.sender?.email) {
      sends.push(
        sgMail.send({
          to: after.sender.email,
          from: FROM,
          subject: "Your authenticated sneakers are on their way!",
          templateId: TEMPLATES.OUTBOUND_LABEL,
          dynamicTemplateData: {
            firstName: after.sender.name,
            otherName: after.poster?.name ?? "",
            carrier: after.senderOutbound.carrier,
            trackingNumber: after.senderOutbound.tracking,
            tradeId: after.id,
            tradeUrl,
          },
        })
      );
    }

    if (!before.posterOutbound && after.posterOutbound && after.poster?.email) {
      sends.push(
        sgMail.send({
          to: after.poster.email,
          from: FROM,
          subject: "Your authenticated sneakers are on their way!",
          templateId: TEMPLATES.OUTBOUND_LABEL,
          dynamicTemplateData: {
            firstName: after.poster.name,
            otherName: after.sender?.name ?? "",
            carrier: after.posterOutbound.carrier,
            trackingNumber: after.posterOutbound.tracking,
            tradeId: after.id,
            tradeUrl,
          },
        })
      );
    }

    await Promise.all(sends);
  }
);

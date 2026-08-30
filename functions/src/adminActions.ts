import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions/v2";
import sgMail from "@sendgrid/mail";
import { writeAuditLog } from "./utils/auditLog";

const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");

const FROM = "trading@barterr.ai";

const TEMPLATES = {
  ACCOUNT_WARNING:            "d-c542034da1ab47c5850245e310ab009d",
  ACCOUNT_BANNED:             "d-48cd3183d9e649e9a6f231a2d2ac4e86",
  LISTING_CHANGES_REQUESTED:  "d-e6b1fe95c3944b7cafbe458039ce510c",
  ORDER_CANCELLED:            "d-a5eb3e834ee74308ba91b37538988f4d",
} as const;

const CORS_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://barterr.ai",
  "https://dev.barterr.ai",
];

type AdminRole = "super_admin" | "admin";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TRAINING_PHOTO_TYPES = [
  "appearance", "boxLabel", "insoles",
  "boxFrontal", "insoleStitching", "dateCode",
] as const;

/** Extracts the GCS object path from a Firebase Storage download URL. */
function extractStoragePath(url: string): string | null {
  const match = url.match(/\/o\/([^?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Copies each listing photo to training-data/{listingId}/ in the same bucket.
 * Returns a map of photoType → gs:// URI for the immutable copy.
 * Per-photo failures are logged and skipped — never blocks the review action.
 */
async function copyPhotosToTrainingStorage(
  rawPhotos: Record<string, string>,
  listingId: string
): Promise<Record<string, string>> {
  const bucket = getStorage().bucket();
  const copied: Record<string, string> = {};

  await Promise.all(
    TRAINING_PHOTO_TYPES.map(async (photoType) => {
      const originalUrl = rawPhotos[photoType];
      if (!originalUrl) return;
      const srcPath = extractStoragePath(originalUrl);
      if (!srcPath) return;
      try {
        const ext = srcPath.split(".").pop() ?? "jpg";
        const destPath = `training-data/${listingId}/${photoType}.${ext}`;
        await bucket.file(srcPath).copy(bucket.file(destPath));
        copied[photoType] = `gs://${bucket.name}/${destPath}`;
      } catch (err) {
        logger.warn(`trainingData: photo copy failed [${photoType}] listing=${listingId}:`, err);
      }
    })
  );

  return copied;
}

async function assertSuperAdmin(uid: string) {
  const claims = (await getAuth().getUser(uid)).customClaims ?? {};
  if (claims.role !== "super_admin") {
    throw new HttpsError("permission-denied", "Only super admins can perform this action.");
  }
}

// ─── Set admin role ───────────────────────────────────────────────────────────

export const setAdminRole = onCall({ region: "us-central1", cors: CORS_ORIGINS, invoker: "public" }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  await assertSuperAdmin(req.auth.uid);

  const { uid, role } = req.data as { uid: string; role: AdminRole | null };
  if (!uid) throw new HttpsError("invalid-argument", "uid is required.");

  if (role === null) {
    await getAuth().setCustomUserClaims(uid, {});
    await getAuth().revokeRefreshTokens(uid);
  } else {
    if (role !== "super_admin" && role !== "admin") {
      throw new HttpsError("invalid-argument", "role must be super_admin, admin, or null.");
    }
    await getAuth().setCustomUserClaims(uid, { role });
    await getAuth().revokeRefreshTokens(uid);
  }

  await writeAuditLog({
    eventType: "admin.role_set",
    functionName: "setAdminRole",
    actorId: req.auth.uid,
    targetId: uid,
    targetType: "user",
    status: "success",
    durationMs: 0,
    metadata: { role: role ?? "removed" },
  });

  logger.info(`Role ${role ?? "removed"} set on ${uid} by ${req.auth.uid}`);
  return { success: true };
});

// ─── Disable user ─────────────────────────────────────────────────────────────

export const disableUser = onCall({ region: "us-central1", cors: CORS_ORIGINS, invoker: "public" }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  await assertSuperAdmin(req.auth.uid);

  const { uid, reason } = req.data as { uid: string; reason?: string };
  if (!uid) throw new HttpsError("invalid-argument", "uid is required.");

  await getAuth().updateUser(uid, { disabled: true });
  await getAuth().revokeRefreshTokens(uid);

  await writeAuditLog({
    eventType: "admin.user_disabled",
    functionName: "disableUser",
    actorId: req.auth.uid,
    targetId: uid,
    targetType: "user",
    status: "success",
    durationMs: 0,
    metadata: { reason: reason ?? "" },
  });

  await getFirestore().collection("users").doc(uid).set({
    accountStatus: "disabled",
    disabledAt: FieldValue.serverTimestamp(),
    disabledBy: req.auth.uid,
    disabledReason: reason ?? "",
  }, { merge: true });

  logger.info(`User ${uid} disabled by ${req.auth.uid}`);
  return { success: true };
});

// ─── Enable user ──────────────────────────────────────────────────────────────

export const enableUser = onCall({ region: "us-central1", cors: CORS_ORIGINS, invoker: "public" }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  await assertSuperAdmin(req.auth.uid);

  const { uid } = req.data as { uid: string };
  if (!uid) throw new HttpsError("invalid-argument", "uid is required.");

  await getAuth().updateUser(uid, { disabled: false });

  await writeAuditLog({
    eventType: "admin.user_enabled",
    functionName: "enableUser",
    actorId: req.auth.uid,
    targetId: uid,
    targetType: "user",
    status: "success",
    durationMs: 0,
    metadata: {},
  });

  await getFirestore().collection("users").doc(uid).set({
    accountStatus: "active",
    reenabledAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  logger.info(`User ${uid} enabled by ${req.auth.uid}`);
  return { success: true };
});

// ─── Resolve flagged attempt ───────────────────────────────────────────────────

export const resolveFlaggedAttempt = onCall(
  { region: "us-central1", cors: CORS_ORIGINS, invoker: "public", secrets: [SENDGRID_API_KEY] },
  async (req) => {
    sgMail.setApiKey(SENDGRID_API_KEY.value());

    if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
    const claims = (await getAuth().getUser(req.auth.uid)).customClaims ?? {};
    if (!claims.role) throw new HttpsError("permission-denied", "Admins only.");

    const { attemptId, resolution } = req.data as {
      attemptId: string;
      resolution: "dismissed" | "warned" | "banned";
    };

    const db = getFirestore();

    const attemptSnap = await db.collection("flaggedAttempts").doc(attemptId).get();
    if (!attemptSnap.exists) throw new HttpsError("not-found", "Flagged attempt not found.");
    const senderId = (attemptSnap.data()!.senderId) as string;

    await db.collection("flaggedAttempts").doc(attemptId).update({
      resolved: true,
      resolution,
      resolvedBy: req.auth.uid,
      resolvedAt: FieldValue.serverTimestamp(),
    });

    if (resolution === "dismissed") {
      await writeAuditLog({
        eventType: "admin.flag_resolved",
        functionName: "resolveFlaggedAttempt",
        actorId: req.auth.uid,
        targetId: attemptId,
        targetType: "flaggedAttempt",
        status: "success",
        durationMs: 0,
        metadata: { resolution, senderId },
      });
      return { success: true };
    }

    const userRecord = await getAuth().getUser(senderId);
    const firstName = (userRecord.displayName ?? "there").split(" ")[0];
    const email = userRecord.email;

    if (resolution === "warned") {
      const [userSnap, configSnap] = await Promise.all([
        db.collection("users").doc(senderId).get(),
        db.collection("config").doc("moderation").get(),
      ]);

      const currentCount = (userSnap.data()?.warningCount ?? 0) as number;
      const threshold = (configSnap.data()?.autoBanThreshold ?? 3) as number;
      const newCount = currentCount + 1;
      const shouldAutoBan = newCount >= threshold;

      await Promise.all([
        db.collection("users").doc(senderId).set({
          warningCount: FieldValue.increment(1),
          lastWarnedAt: FieldValue.serverTimestamp(),
        }, { merge: true }),

        db.collection("users").doc(senderId).collection("notifications").add({
          type: "account_warning",
          title: "Account Warning",
          body: "Your account has received a warning for violating Barterr's Terms of Service.",
          data: {},
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        }),
      ]);

      if (email) {
        await sgMail.send({
          to: email,
          from: FROM,
          subject: "Account Warning — Terms of Service Violation",
          templateId: TEMPLATES.ACCOUNT_WARNING,
          dynamicTemplateData: { firstName },
        }).catch((err) => logger.error("[resolveFlaggedAttempt] Warning email failed", err));
      }

      if (shouldAutoBan) {
        await getAuth().updateUser(senderId, { disabled: true });
        await getAuth().revokeRefreshTokens(senderId);

        await Promise.all([
          db.collection("users").doc(senderId).set({
            accountStatus: "disabled",
            disabledAt: FieldValue.serverTimestamp(),
            disabledReason: "Automatic ban after reaching warning threshold",
            disabledBy: "system",
          }, { merge: true }),

          db.collection("users").doc(senderId).collection("notifications").add({
            type: "account_banned",
            title: "Account Suspended",
            body: "Your account has been suspended after receiving multiple warnings.",
            data: {},
            read: false,
            createdAt: FieldValue.serverTimestamp(),
          }),
        ]);

        if (email) {
          await sgMail.send({
            to: email,
            from: FROM,
            subject: "Account Suspended — Terms of Service Violation",
            templateId: TEMPLATES.ACCOUNT_BANNED,
            dynamicTemplateData: { firstName },
          }).catch((err) => logger.error("[resolveFlaggedAttempt] Auto-ban email failed", err));
        }
      }
    } else if (resolution === "banned") {
      await getAuth().updateUser(senderId, { disabled: true });
      await getAuth().revokeRefreshTokens(senderId);

      await Promise.all([
        db.collection("users").doc(senderId).set({
          accountStatus: "disabled",
          disabledAt: FieldValue.serverTimestamp(),
          disabledReason: "Terms of Service violation",
          disabledBy: req.auth.uid,
        }, { merge: true }),

        db.collection("users").doc(senderId).collection("notifications").add({
          type: "account_banned",
          title: "Account Suspended",
          body: "Your account has been suspended for violating Barterr's Terms of Service.",
          data: {},
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        }),
      ]);

      if (email) {
        await sgMail.send({
          to: email,
          from: FROM,
          subject: "Account Suspended — Terms of Service Violation",
          templateId: TEMPLATES.ACCOUNT_BANNED,
          dynamicTemplateData: { firstName },
        }).catch((err) => logger.error("[resolveFlaggedAttempt] Ban email failed", err));
      }
    }

    await writeAuditLog({
      eventType: "admin.flag_resolved",
      functionName: "resolveFlaggedAttempt",
      actorId: req.auth.uid,
      targetId: attemptId,
      targetType: "flaggedAttempt",
      status: "success",
      durationMs: 0,
      metadata: { resolution, senderId },
    });
    return { success: true };
  }
);

// ─── Approve / reject listing ─────────────────────────────────────────────────

export const reviewListing = onCall(
  { region: "us-central1", cors: CORS_ORIGINS, invoker: "public", secrets: [SENDGRID_API_KEY] },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
    const claims = (await getAuth().getUser(req.auth.uid)).customClaims ?? {};
    if (!claims.role) throw new HttpsError("permission-denied", "Admins only.");

    const { listingId, action, feedback, rejectionReasons } = req.data as {
      listingId: string;
      action: "approve" | "reject" | "request_changes";
      feedback?: string;
      rejectionReasons?: string[];
    };

    if ((action === "reject" || action === "request_changes") && !feedback?.trim()) {
      throw new HttpsError("invalid-argument", "A reason is required when rejecting or requesting changes.");
    }

    const db = getFirestore();
    const base = { reviewedBy: req.auth.uid, reviewedAt: FieldValue.serverTimestamp() };

    const approvalStatus =
      action === "approve" ? "approved" :
      action === "reject" ? "rejected" :
      "changes_requested";

    // Fetch listing to get owner info before updating
    const listingSnap = await db.collection("listings").doc(listingId).get();
    const listingData = listingSnap.data() ?? {};
    const ownerId = listingData.userId as string | undefined;

    await db.collection("listings").doc(listingId).update({
      ...base,
      approvalStatus,
      ...(feedback ? { reviewFeedback: feedback } : {}),
    });

    // Copy photos to immutable training-data/ storage path before writing the doc.
    // The trainingData document references the copies so the training set survives listing deletion.
    const rawPhotos = (listingData.photos ?? {}) as Record<string, string>;
    const trainingPhotos = await copyPhotosToTrainingStorage(rawPhotos, listingId);

    // Capture training data — every review decision is a labeled example.
    // merge: true so markAuthResult can later write physicalInspection back to the same doc.
    await db.collection("trainingData").doc(listingId).set({
      listingId,
      postId: listingData.postId ?? null,
      // Sneaker identity — essential for model-level training queries
      brand: listingData.brand ?? "",
      styleId: listingData.styleId ?? "",
      productName: listingData.productName ?? "",
      size: listingData.size ?? null,
      condition: listingData.condition ?? null,
      // Immutable GCS copies — gs:// paths survive listing deletion and plug directly into Vertex AI
      photos: trainingPhotos,
      // Label
      label: approvalStatus,
      labelSource: "admin_review",
      // Structured reasons — the ML-useful signal (free text alone is useless for training)
      rejectionReasons: rejectionReasons ?? [],
      // Human notes preserved as secondary context
      reviewerNotes: feedback ?? "",
      reviewerId: req.auth.uid,
      reviewedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    if (action === "request_changes" && ownerId) {
      try {
        const userSnap = await db.collection("users").doc(ownerId).get();
        const userData = userSnap.data() ?? {};
        const email = userData.email as string | undefined;
        const displayName = (userData.displayName as string | undefined) ?? "";
        const firstName = displayName.split(" ")[0] || "there";

        // Fetch post title for the listing
        let listingTitle = "Your listing";
        if (listingData.postId) {
          try {
            const postSnap = await db.collection("posts").doc(listingData.postId).get();
            const postData = postSnap.data();
            if (postData?.title) listingTitle = postData.title as string;
          } catch { /* ignore */ }
        }

        // In-app notification
        await db.collection("users").doc(ownerId).collection("notifications").add({
          type: "listing_changes_requested",
          title: "Listing update required",
          body: `Your listing "${listingTitle}" needs changes before it can be approved.`,
          data: { listingId },
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });

        // Email (skip if template placeholder not yet set)
        if (email && !TEMPLATES.LISTING_CHANGES_REQUESTED.includes("PLACEHOLDER")) {
          sgMail.setApiKey(SENDGRID_API_KEY.value());
          await sgMail.send({
            to: email,
            from: FROM,
            subject: "Your Barterr Listing Needs Updates",
            templateId: TEMPLATES.LISTING_CHANGES_REQUESTED,
            dynamicTemplateData: { firstName, listingTitle, feedbackMessage: feedback ?? "" },
          });
        }
      } catch (err) {
        logger.error("reviewListing changes_requested notification error:", err);
      }
    }

    await writeAuditLog({
      eventType: "admin.listing_reviewed",
      functionName: "reviewListing",
      actorId: req.auth.uid,
      targetId: listingId,
      targetType: "listing",
      status: "success",
      durationMs: 0,
      metadata: { action, approvalStatus, ownerId: ownerId ?? null, feedback: feedback ?? null },
    });
    return { success: true };
  }
);

export const sendOrderPhotosEmail = onCall(
  { secrets: [SENDGRID_API_KEY], cors: CORS_ORIGINS },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Must be authenticated");
    const claims = req.auth.token as { role?: string };
    if (!["admin", "super_admin"].includes(claims.role ?? "")) {
      throw new HttpsError("permission-denied", "Admin only");
    }

    const { tradeId, senderPhotos, posterPhotos, senderName, posterName } = req.data as {
      tradeId: string;
      senderPhotos: string[];
      posterPhotos: string[];
      senderName: string;
      posterName: string;
    };

    const photoGrid = (urls: string[], label: string) => `
      <h3 style="font-family:sans-serif;margin:24px 0 8px;">${label}</h3>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${urls.map((u) => `<a href="${u}" target="_blank"><img src="${u}" width="180" height="180" style="object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;" /></a>`).join("")}
      </div>`;

    sgMail.setApiKey(SENDGRID_API_KEY.value());
    await sgMail.send({
      to: "terrence@barterr.ai",
      from: FROM,
      subject: `Order Photos — ${senderName} ↔ ${posterName}`,
      html: `
        <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px;">
          <h2 style="margin:0 0 4px;">Order Photo Review</h2>
          <p style="color:#6b7280;margin:0 0 16px;font-size:13px;">Trade ID: ${tradeId}</p>
          ${photoGrid(senderPhotos, `Sender — ${senderName}`)}
          ${photoGrid(posterPhotos, `Poster — ${posterName}`)}
        </div>`,
    });

    return { success: true };
  }
);

// ─── Cancel order ─────────────────────────────────────────────────────────────

export const cancelOrder = onCall(
  { region: "us-central1", secrets: [SENDGRID_API_KEY], cors: CORS_ORIGINS, invoker: "public" },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
    const claims = req.auth.token as { role?: string };
    if (!["admin", "super_admin"].includes(claims.role ?? "")) {
      throw new HttpsError("permission-denied", "Admin only");
    }

    const { tradeId, reason, noShowRole, notes } = req.data as {
      tradeId: string;
      reason: "no_show" | "auth_failure_no_response" | "other";
      noShowRole?: "sender" | "poster";
      notes?: string;
    };

    if (!tradeId || !reason) {
      throw new HttpsError("invalid-argument", "tradeId and reason are required");
    }

    const db = getFirestore();
    const orderRef = db.collection("orders").doc(tradeId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new HttpsError("not-found", "Order not found");

    const order = orderSnap.data()!;
    if (order.status === "cancelled") {
      throw new HttpsError("failed-precondition", "Order is already cancelled");
    }

    await orderRef.update({
      status: "cancelled",
      cancelledAt: FieldValue.serverTimestamp(),
      cancellationReason: reason,
      cancelledBy: req.auth.uid,
      ...(noShowRole ? { noShowRole } : {}),
      ...(notes?.trim() ? { cancellationNotes: notes.trim() } : {}),
    });

    // Flag the trades document so the user-facing trade detail page reflects cancellation
    await db.collection("trades").doc(tradeId).update({ orderCancelled: true });

    // In-app notifications to both parties
    const notifBodies: Record<string, string> = {
      no_show: "Your trade was cancelled because the other party didn't ship on time.",
      auth_failure_no_response: "Your trade was cancelled due to an unresolved authentication issue with the sneakers.",
      other: "Your trade has been cancelled by Barterr. Please check your email for details.",
    };
    const notifBody = notifBodies[reason] ?? "Your trade has been cancelled.";
    const notifParties = [
      order.sender?.id,
      order.poster?.id,
    ].filter((id): id is string => !!id);

    await Promise.all(
      notifParties.map((id) =>
        db.collection("users").doc(id).collection("notifications").add({
          type: "order_cancelled",
          title: "Trade Cancelled",
          body: notifBody,
          data: { tradeId },
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        })
      )
    );

    sgMail.setApiKey(SENDGRID_API_KEY.value());

    const cancellationReason: Record<string, string> = {
      no_show: "the other party not shipping their sneakers within the required timeframe",
      auth_failure_no_response: "an unresolved authentication issue with the other party's sneakers",
      other: "an issue with this order",
    };

    const emailParties = [
      { role: "sender", email: order.sender?.email, name: order.sender?.name },
      { role: "poster", email: order.poster?.email, name: order.poster?.name },
    ];

    const emailResults = !TEMPLATES.ORDER_CANCELLED.startsWith("PLACEHOLDER")
      ? await Promise.allSettled(
          emailParties.map(({ email, name }) =>
            email
              ? sgMail.send({
                  to: email,
                  from: FROM,
                  subject: "Your Barterr Trade Has Been Cancelled",
                  templateId: TEMPLATES.ORDER_CANCELLED,
                  dynamicTemplateData: {
                    firstName: (name ?? "there").split(" ")[0],
                    cancellationReason: cancellationReason[reason] ?? "an issue with this order",
                  },
                })
              : Promise.resolve()
          )
        )
      : [];

    const emailFailures = emailResults
      .map((result, i) =>
        result.status === "rejected"
          ? { party: emailParties[i].role, error: (result.reason as Error)?.message ?? "unknown" }
          : null
      )
      .filter((e): e is { party: string; error: string } => e !== null);

    await writeAuditLog({
      eventType: "admin.order_cancelled",
      functionName: "cancelOrder",
      actorId: req.auth.uid,
      targetId: tradeId,
      targetType: "order",
      status: "success",
      durationMs: 0,
      metadata: {
        reason,
        noShowRole: noShowRole ?? null,
        notes: notes ?? null,
        ...(emailFailures.length > 0 ? { emailFailures } : {}),
      },
    });

    return { success: true };
  }
);

// Auto-approve audit log — deadstock (10/10) listings bypass reviewListing and are
// approved directly by the client write. This trigger captures that event.
export const onListingCreatedAudit = onDocumentCreated(
  { document: "listings/{listingId}", region: "us-central1" },
  async (event) => {
    const data = event.data?.data();
    if (!data || data.approvalStatus !== "approved") return;

    await writeAuditLog({
      eventType: "listing.auto_approved",
      functionName: "onListingCreatedAudit",
      actorId: data.userId ?? "unknown",
      targetId: event.params.listingId,
      targetType: "listing",
      status: "success",
      durationMs: 0,
      metadata: {
        productName: data.productName ?? null,
        brand: data.brand ?? null,
        conditionGrade: data.conditionGrade ?? null,
        reason: "deadstock",
      },
    });
  }
);

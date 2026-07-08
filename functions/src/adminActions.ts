import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import sgMail from "@sendgrid/mail";

const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");

const FROM = "trading@barterr.ai";

const TEMPLATES = {
  ACCOUNT_WARNING: "d-c542034da1ab47c5850245e310ab009d",
  ACCOUNT_BANNED:  "d-48cd3183d9e649e9a6f231a2d2ac4e86",
} as const;

const CORS_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://barterr.ai",
  "https://dev.barterr.ai",
];

type AdminRole = "super_admin" | "admin";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

  await getFirestore().collection("adminAuditLog").add({
    action: "set_role",
    targetUid: uid,
    role: role ?? "removed",
    performedBy: req.auth.uid,
    at: FieldValue.serverTimestamp(),
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

  await getFirestore().collection("adminAuditLog").add({
    action: "disable_user",
    targetUid: uid,
    reason: reason ?? "",
    performedBy: req.auth.uid,
    at: FieldValue.serverTimestamp(),
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

  await getFirestore().collection("adminAuditLog").add({
    action: "enable_user",
    targetUid: uid,
    performedBy: req.auth.uid,
    at: FieldValue.serverTimestamp(),
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

    if (resolution === "dismissed") return { success: true };

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

    return { success: true };
  }
);

// ─── Approve / reject listing ─────────────────────────────────────────────────

export const reviewListing = onCall({ region: "us-central1", cors: CORS_ORIGINS, invoker: "public" }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const claims = (await getAuth().getUser(req.auth.uid)).customClaims ?? {};
  if (!claims.role) throw new HttpsError("permission-denied", "Admins only.");

  const { listingId, action, feedback } = req.data as {
    listingId: string;
    action: "approve" | "reject" | "request_changes";
    feedback?: string;
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

  await db.collection("listings").doc(listingId).update({
    ...base,
    approvalStatus,
    ...(feedback ? { reviewFeedback: feedback } : {}),
  });

  return { success: true };
});

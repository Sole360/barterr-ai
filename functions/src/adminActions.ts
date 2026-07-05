import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

type AdminRole = "super_admin" | "admin";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertSuperAdmin(uid: string) {
  const claims = (await getAuth().getUser(uid)).customClaims ?? {};
  if (claims.role !== "super_admin") {
    throw new HttpsError("permission-denied", "Only super admins can perform this action.");
  }
}

// ─── Set admin role ───────────────────────────────────────────────────────────

export const setAdminRole = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  await assertSuperAdmin(req.auth.uid);

  const { uid, role } = req.data as { uid: string; role: AdminRole | null };
  if (!uid) throw new HttpsError("invalid-argument", "uid is required.");

  if (role === null) {
    // Remove admin access entirely
    await getAuth().setCustomUserClaims(uid, {});
    await getAuth().revokeRefreshTokens(uid);
  } else {
    if (role !== "super_admin" && role !== "admin") {
      throw new HttpsError("invalid-argument", "role must be super_admin, admin, or null.");
    }
    await getAuth().setCustomUserClaims(uid, { role });
    await getAuth().revokeRefreshTokens(uid);
  }

  // Log to Firestore for audit trail
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

export const disableUser = onCall(async (req) => {
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

  // Mark on user doc so it's queryable
  await getFirestore().collection("users").doc(uid).update({
    accountStatus: "disabled",
    disabledAt: FieldValue.serverTimestamp(),
    disabledBy: req.auth.uid,
    disabledReason: reason ?? "",
  });

  logger.info(`User ${uid} disabled by ${req.auth.uid}`);
  return { success: true };
});

// ─── Enable user ──────────────────────────────────────────────────────────────

export const enableUser = onCall(async (req) => {
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

  await getFirestore().collection("users").doc(uid).update({
    accountStatus: "active",
    disabledAt: FieldValue.serverTimestamp(),
  });

  logger.info(`User ${uid} enabled by ${req.auth.uid}`);
  return { success: true };
});

// ─── Resolve flagged attempt ───────────────────────────────────────────────────

export const resolveFlaggedAttempt = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const claims = (await getAuth().getUser(req.auth.uid)).customClaims ?? {};
  if (!claims.role) throw new HttpsError("permission-denied", "Admins only.");

  const { attemptId, resolution } = req.data as {
    attemptId: string;
    resolution: "dismissed" | "warned" | "banned";
  };

  await getFirestore().collection("flaggedAttempts").doc(attemptId).update({
    resolved: true,
    resolution,
    resolvedBy: req.auth.uid,
    resolvedAt: FieldValue.serverTimestamp(),
  });

  return { success: true };
});

// ─── Approve / reject listing ─────────────────────────────────────────────────

export const reviewListing = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const claims = (await getAuth().getUser(req.auth.uid)).customClaims ?? {};
  if (!claims.role) throw new HttpsError("permission-denied", "Admins only.");

  const { postId, action, feedback } = req.data as {
    postId: string;
    action: "approve" | "reject" | "request_changes";
    feedback?: string;
  };

  if ((action === "reject" || action === "request_changes") && !feedback?.trim()) {
    throw new HttpsError("invalid-argument", "A reason is required when rejecting or requesting changes.");
  }

  const db = getFirestore();
  const base = { reviewedBy: req.auth.uid, reviewedAt: FieldValue.serverTimestamp() };

  if (action === "approve") {
    await db.collection("posts").doc(postId).update({ ...base, status: "approved", active: true });
  } else if (action === "reject") {
    await db.collection("posts").doc(postId).update({ ...base, status: "rejected", active: false, reviewFeedback: feedback });
  } else if (action === "request_changes") {
    await db.collection("posts").doc(postId).update({ ...base, status: "changes_requested", active: false, reviewFeedback: feedback });
  }

  return { success: true };
});

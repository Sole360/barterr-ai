import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

export type AuditEventType =
  | "trade.accepted"
  | "trade.payment_captured"
  | "trade.payment_failed"
  | "trade.payment_retried"
  | "trade.completed"
  | "label.inbound_created"
  | "label.outbound_created"
  | "auth.sneakers_received"
  | "auth.result"
  | "admin.listing_reviewed"
  | "admin.user_disabled"
  | "admin.user_enabled"
  | "admin.flag_resolved"
  | "admin.role_set";

export type AuditTargetType = "trade" | "order" | "user" | "listing" | "flaggedAttempt";

export interface AuditLogEntry {
  eventType: AuditEventType;
  functionName: string;
  actorId: string;
  targetId: string;
  targetType: AuditTargetType;
  status: "success" | "failure";
  durationMs: number;
  metadata: Record<string, unknown>;
}

export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await getFirestore().collection("auditLogs").add({
      ...entry,
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    logger.error("[auditLog] Failed to write audit entry", { eventType: entry.eventType, targetId: entry.targetId, err });
  }
}

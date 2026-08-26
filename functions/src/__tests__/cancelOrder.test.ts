// ─── Module mocks (hoisted by ts-jest before any imports) ────────────────────

jest.mock("firebase-functions/v2/https", () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = "HttpsError";
    }
  }
  return {
    onCall: (_opts: unknown, handler: unknown) => handler,
    HttpsError,
  };
});

jest.mock("firebase-functions/v2", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  setGlobalOptions: jest.fn(),
}));

jest.mock("firebase-functions/params", () => ({
  defineSecret: jest.fn(() => ({ value: () => "test-api-key" })),
}));

jest.mock("@sendgrid/mail", () => ({
  __esModule: true,
  default: { setApiKey: jest.fn(), send: jest.fn() },
}));

jest.mock("firebase-admin/auth", () => ({
  getAuth: jest.fn(() => ({
    getUser: jest.fn(),
    setCustomUserClaims: jest.fn(),
    revokeRefreshTokens: jest.fn(),
    updateUser: jest.fn(),
  })),
}));

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(),
  FieldValue: {
    serverTimestamp: jest.fn(() => "SERVER_TIMESTAMP"),
    increment: jest.fn((n: number) => n),
  },
}));

jest.mock("../utils/auditLog", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import sgMail from "@sendgrid/mail";
import { getFirestore } from "firebase-admin/firestore";
import { writeAuditLog } from "../utils/auditLog";
import { cancelOrder } from "../adminActions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const adminAuth  = { uid: "admin-uid",  token: { role: "admin" } };
const sadminAuth = { uid: "sadmin-uid", token: { role: "super_admin" } };
const userAuth   = { uid: "user-uid",   token: { role: "user" } };

const req = (data: Record<string, unknown>, auth: typeof adminAuth | null = adminAuth) =>
  ({ auth, data }) as any;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("cancelOrder", () => {
  const validOrder = {
    sender: { id: "sender-uid", name: "John Doe",    email: "john@example.com" },
    poster: { id: "poster-uid", name: "Jane Smith",  email: "jane@example.com" },
  };

  let mockGet: jest.Mock;
  let mockUpdate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGet    = jest.fn().mockResolvedValue({ exists: true, data: () => validOrder });
    mockUpdate = jest.fn().mockResolvedValue({});
    const mockDoc        = jest.fn(() => ({ get: mockGet, update: mockUpdate }));
    const mockCollection = jest.fn(() => ({ doc: mockDoc }));
    (getFirestore as jest.Mock).mockReturnValue({ collection: mockCollection });
    (sgMail.send as jest.Mock).mockResolvedValue([{ statusCode: 202 }]);
  });

  // ── Auth & permissions ────────────────────────────────────────────────────

  it("throws unauthenticated when req.auth is null", async () => {
    await expect((cancelOrder as any)(req({ tradeId: "t1", reason: "other" }, null)))
      .rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws permission-denied for a non-admin user", async () => {
    await expect((cancelOrder as any)(req({ tradeId: "t1", reason: "other" }, userAuth)))
      .rejects.toMatchObject({ code: "permission-denied" });
  });

  it("allows super_admin role", async () => {
    await expect((cancelOrder as any)(req({ tradeId: "t1", reason: "other" }, sadminAuth)))
      .resolves.toEqual({ success: true });
  });

  // ── Argument validation ───────────────────────────────────────────────────

  it("throws invalid-argument when tradeId is missing", async () => {
    await expect((cancelOrder as any)(req({ reason: "other" })))
      .rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when reason is missing", async () => {
    await expect((cancelOrder as any)(req({ tradeId: "t1" })))
      .rejects.toMatchObject({ code: "invalid-argument" });
  });

  // ── Firestore guards ──────────────────────────────────────────────────────

  it("throws not-found when the order document does not exist", async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    await expect((cancelOrder as any)(req({ tradeId: "t1", reason: "other" })))
      .rejects.toMatchObject({ code: "not-found" });
  });

  it("throws failed-precondition when order is already cancelled", async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...validOrder, status: "cancelled" }) });
    await expect((cancelOrder as any)(req({ tradeId: "t1", reason: "other" })))
      .rejects.toMatchObject({ code: "failed-precondition" });
  });

  // ── Firestore update ──────────────────────────────────────────────────────

  it("sets status: cancelled, cancellationReason, cancelledBy, and cancelledAt", async () => {
    await (cancelOrder as any)(req({ tradeId: "t1", reason: "other" }));
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: "cancelled",
      cancellationReason: "other",
      cancelledBy: "admin-uid",
      cancelledAt: "SERVER_TIMESTAMP",
    }));
  });

  it("includes noShowRole when provided", async () => {
    await (cancelOrder as any)(req({ tradeId: "t1", reason: "no_show", noShowRole: "sender" }));
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ noShowRole: "sender" }));
  });

  it("omits noShowRole from update when not provided", async () => {
    await (cancelOrder as any)(req({ tradeId: "t1", reason: "other" }));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.not.objectContaining({ noShowRole: expect.anything() })
    );
  });

  it("includes cancellationNotes when notes are provided", async () => {
    await (cancelOrder as any)(req({ tradeId: "t1", reason: "other", notes: "Called user — no response" }));
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      cancellationNotes: "Called user — no response",
    }));
  });

  it("omits cancellationNotes when notes is whitespace only", async () => {
    await (cancelOrder as any)(req({ tradeId: "t1", reason: "other", notes: "   " }));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.not.objectContaining({ cancellationNotes: expect.anything() })
    );
  });

  // ── Emails ────────────────────────────────────────────────────────────────

  it("sends a cancellation email to both sender and poster", async () => {
    await (cancelOrder as any)(req({ tradeId: "t1", reason: "other" }));
    expect(sgMail.send).toHaveBeenCalledTimes(2);
    const to = (sgMail.send as jest.Mock).mock.calls.map((c) => c[0].to);
    expect(to).toContain("john@example.com");
    expect(to).toContain("jane@example.com");
  });

  it("passes each party's first name to dynamicTemplateData", async () => {
    await (cancelOrder as any)(req({ tradeId: "t1", reason: "other" }));
    const firstNames = (sgMail.send as jest.Mock).mock.calls.map((c) => c[0].dynamicTemplateData.firstName);
    expect(firstNames).toContain("John");
    expect(firstNames).toContain("Jane");
  });

  it("sends the correct cancellationReason text for no_show", async () => {
    await (cancelOrder as any)(req({ tradeId: "t1", reason: "no_show" }));
    const reasons = (sgMail.send as jest.Mock).mock.calls.map((c) => c[0].dynamicTemplateData.cancellationReason);
    expect(reasons[0]).toContain("not shipping");
  });

  it("sends the correct cancellationReason text for auth_failure_no_response", async () => {
    await (cancelOrder as any)(req({ tradeId: "t1", reason: "auth_failure_no_response" }));
    const reasons = (sgMail.send as jest.Mock).mock.calls.map((c) => c[0].dynamicTemplateData.cancellationReason);
    expect(reasons[0]).toContain("authentication issue");
  });

  it("skips the email for a party with no email address on file", async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...validOrder, poster: { ...validOrder.poster, email: undefined } }),
    });
    await (cancelOrder as any)(req({ tradeId: "t1", reason: "other" }));
    expect(sgMail.send).toHaveBeenCalledTimes(1);
  });

  it("does not throw if SendGrid fails — Promise.allSettled absorbs the error", async () => {
    (sgMail.send as jest.Mock).mockRejectedValue(new Error("SendGrid down"));
    await expect((cancelOrder as any)(req({ tradeId: "t1", reason: "other" })))
      .resolves.toEqual({ success: true });
  });

  it("records email failures in the audit log metadata when SendGrid is down", async () => {
    (sgMail.send as jest.Mock).mockRejectedValue(new Error("SendGrid down"));
    await (cancelOrder as any)(req({ tradeId: "t1", reason: "other" }));
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        emailFailures: expect.arrayContaining([
          expect.objectContaining({ party: "sender", error: "SendGrid down" }),
          expect.objectContaining({ party: "poster", error: "SendGrid down" }),
        ]),
      }),
    }));
  });

  it("does not include emailFailures in metadata when emails succeed", async () => {
    await (cancelOrder as any)(req({ tradeId: "t1", reason: "other" }));
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.not.objectContaining({ emailFailures: expect.anything() }),
    }));
  });

  // ── Audit log ─────────────────────────────────────────────────────────────

  it("writes an admin.order_cancelled audit log entry", async () => {
    await (cancelOrder as any)(req({ tradeId: "t1", reason: "no_show", noShowRole: "poster" }));
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "admin.order_cancelled",
      functionName: "cancelOrder",
      actorId: "admin-uid",
      targetId: "t1",
      targetType: "order",
      status: "success",
      metadata: expect.objectContaining({ reason: "no_show", noShowRole: "poster" }),
    }));
  });

  it("returns { success: true }", async () => {
    const result = await (cancelOrder as any)(req({ tradeId: "t1", reason: "other" }));
    expect(result).toEqual({ success: true });
  });
});

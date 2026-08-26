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

jest.mock("firebase-functions/v2/firestore", () => ({
  onDocumentUpdated: (_opts: unknown, handler: unknown) => handler,
}));

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

// firebase-admin default import: admin.firestore() and admin.auth()
jest.mock("firebase-admin", () => ({
  firestore: jest.fn(),
  auth: jest.fn(() => ({ getUser: jest.fn() })),
}));

// firebase-admin/firestore named imports
jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: jest.fn(() => "SERVER_TIMESTAMP"),
    increment: jest.fn((n: number) => n),
  },
}));

// Prevent real Shippo HTTP calls
jest.mock("axios", () => ({
  create: jest.fn(() => ({ post: jest.fn() })),
}));

jest.mock("../utils/auditLog", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import sgMail from "@sendgrid/mail";
import admin from "firebase-admin";
import { writeAuditLog } from "../utils/auditLog";
import { markAuthResult, markSneakersReceived } from "../shipping";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const adminAuth = { uid: "admin-uid", token: { role: "admin" } };
const userAuth  = { uid: "user-uid",  token: { role: "user" } };

const req = (data: Record<string, unknown>, auth: typeof adminAuth | null = adminAuth) =>
  ({ auth, data }) as any;

// ─────────────────────────────────────────────────────────────────────────────
// markAuthResult
// ─────────────────────────────────────────────────────────────────────────────

describe("markAuthResult", () => {
  // Order where both sides have shipped their sneakers in
  const baseOrder = {
    sender: { id: "sender-uid", name: "Alice Walker", email: "alice@example.com", sneakerReceived: true },
    poster: { id: "poster-uid", name: "Bob Jones",   email: "bob@example.com",   sneakerReceived: true },
  };

  let mockGet: jest.Mock;
  let mockUpdate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGet    = jest.fn().mockResolvedValue({ exists: true, data: () => baseOrder });
    mockUpdate = jest.fn().mockResolvedValue({});
    const mockDoc = jest.fn(() => ({ get: mockGet, update: mockUpdate }));
    (admin.firestore as unknown as jest.Mock).mockReturnValue({ doc: mockDoc });
    (sgMail.send as jest.Mock).mockResolvedValue([{ statusCode: 202 }]);
  });

  // ── Auth & permissions ────────────────────────────────────────────────────

  it("throws unauthenticated when req.auth is null", async () => {
    await expect(
      (markAuthResult as any)(req({ tradeId: "t1", role: "sender", passed: false }, null))
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws permission-denied for a non-admin user", async () => {
    await expect(
      (markAuthResult as any)(req({ tradeId: "t1", role: "sender", passed: false }, userAuth))
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("throws invalid-argument when tradeId is missing", async () => {
    await expect(
      (markAuthResult as any)(req({ role: "sender", passed: false }))
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when role is missing", async () => {
    await expect(
      (markAuthResult as any)(req({ tradeId: "t1", passed: false }))
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  // ── passed = false (authentication failure) ───────────────────────────────

  describe("passed=false", () => {
    it("sets fakes.userId to the sender's id when role is sender", async () => {
      await (markAuthResult as any)(req({ tradeId: "t1", role: "sender", passed: false, reasons: "Glue stains" }));
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        fakes: { userId: "sender-uid", reasons: "Glue stains" },
      }));
    });

    it("sets fakes.userId to the poster's id when role is poster", async () => {
      await (markAuthResult as any)(req({ tradeId: "t1", role: "poster", passed: false, reasons: "Wrong stitching" }));
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        fakes: { userId: "poster-uid", reasons: "Wrong stitching" },
      }));
    });

    it("defaults reasons to empty string when not provided", async () => {
      await (markAuthResult as any)(req({ tradeId: "t1", role: "sender", passed: false }));
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        fakes: expect.objectContaining({ reasons: "" }),
      }));
    });

    it("emails the POSTER (legitimate party) when the SENDER fails", async () => {
      await (markAuthResult as any)(req({ tradeId: "t1", role: "sender", passed: false }));
      expect(sgMail.send).toHaveBeenCalledWith(expect.objectContaining({
        to: "bob@example.com",
      }));
    });

    it("emails the SENDER (legitimate party) when the POSTER fails", async () => {
      await (markAuthResult as any)(req({ tradeId: "t1", role: "poster", passed: false }));
      expect(sgMail.send).toHaveBeenCalledWith(expect.objectContaining({
        to: "alice@example.com",
      }));
    });

    it("does NOT email the fake sender (sender fails → no email to alice)", async () => {
      await (markAuthResult as any)(req({ tradeId: "t1", role: "sender", passed: false }));
      const recipients = (sgMail.send as jest.Mock).mock.calls.map((c) => c[0].to);
      expect(recipients).not.toContain("alice@example.com");
    });

    it("does NOT email the fake poster (poster fails → no email to bob)", async () => {
      await (markAuthResult as any)(req({ tradeId: "t1", role: "poster", passed: false }));
      const recipients = (sgMail.send as jest.Mock).mock.calls.map((c) => c[0].to);
      expect(recipients).not.toContain("bob@example.com");
    });

    it("passes the legitimate party's first name to dynamicTemplateData", async () => {
      await (markAuthResult as any)(req({ tradeId: "t1", role: "sender", passed: false }));
      expect(sgMail.send).toHaveBeenCalledWith(expect.objectContaining({
        dynamicTemplateData: expect.objectContaining({ firstName: "Bob" }),
      }));
    });

    it("skips the email if the legitimate party has no email address", async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ ...baseOrder, poster: { ...baseOrder.poster, email: undefined } }),
      });
      await (markAuthResult as any)(req({ tradeId: "t1", role: "sender", passed: false }));
      expect(sgMail.send).not.toHaveBeenCalled();
    });

    it("sends exactly one email (not two)", async () => {
      await (markAuthResult as any)(req({ tradeId: "t1", role: "sender", passed: false }));
      expect(sgMail.send).toHaveBeenCalledTimes(1);
    });

    it("writes an auth.result audit log entry with passed: false", async () => {
      await (markAuthResult as any)(req({ tradeId: "t1", role: "sender", passed: false, reasons: "Replica laces" }));
      expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        eventType: "auth.result",
        targetId: "t1",
        targetType: "order",
        status: "success",
        metadata: expect.objectContaining({ passed: false, role: "sender", reasons: "Replica laces" }),
      }));
    });

    it("returns { success: true }", async () => {
      const result = await (markAuthResult as any)(req({ tradeId: "t1", role: "sender", passed: false }));
      expect(result).toEqual({ success: true });
    });
  });

  // ── passed = true ─────────────────────────────────────────────────────────

  describe("passed=true", () => {
    it("sets sender.authenticated: true when role is sender", async () => {
      // After the update, the re-fetch shows only sender is authenticated
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          sender: { ...baseOrder.sender, authenticated: true },
          poster: { ...baseOrder.poster, authenticated: false },
        }),
      });
      await (markAuthResult as any)(req({ tradeId: "t1", role: "sender", passed: true }));
      expect(mockUpdate).toHaveBeenCalledWith({ "sender.authenticated": true });
    });

    it("sets poster.authenticated: true when role is poster", async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          sender: { ...baseOrder.sender, authenticated: false },
          poster: { ...baseOrder.poster, authenticated: true },
        }),
      });
      await (markAuthResult as any)(req({ tradeId: "t1", role: "poster", passed: true }));
      expect(mockUpdate).toHaveBeenCalledWith({ "poster.authenticated": true });
    });

    it("sets completed: true when both sides are now authenticated", async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          sender: { ...baseOrder.sender, authenticated: true },
          poster: { ...baseOrder.poster, authenticated: true },
        }),
      });
      await (markAuthResult as any)(req({ tradeId: "t1", role: "poster", passed: true }));
      expect(mockUpdate).toHaveBeenCalledWith({ completed: true });
    });

    it("does NOT set completed: true when only one side is authenticated", async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          sender: { ...baseOrder.sender, authenticated: true },
          poster: { ...baseOrder.poster, authenticated: false },
        }),
      });
      await (markAuthResult as any)(req({ tradeId: "t1", role: "sender", passed: true }));
      expect(mockUpdate).not.toHaveBeenCalledWith({ completed: true });
    });

    it("writes an auth.result audit log entry with passed: true", async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          sender: { ...baseOrder.sender, authenticated: true },
          poster: { ...baseOrder.poster, authenticated: false },
        }),
      });
      await (markAuthResult as any)(req({ tradeId: "t1", role: "sender", passed: true }));
      expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        eventType: "auth.result",
        status: "success",
        metadata: expect.objectContaining({ passed: true, role: "sender" }),
      }));
    });

    it("does not send any email when auth passes", async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          sender: { ...baseOrder.sender, authenticated: true },
          poster: { ...baseOrder.poster, authenticated: false },
        }),
      });
      await (markAuthResult as any)(req({ tradeId: "t1", role: "sender", passed: true }));
      expect(sgMail.send).not.toHaveBeenCalled();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// markSneakersReceived
// ─────────────────────────────────────────────────────────────────────────────

describe("markSneakersReceived", () => {
  const orderWithBothLabels = {
    sender: { id: "sender-uid", sneakerReceived: false },
    poster: { id: "poster-uid", sneakerReceived: false },
    trackingSender: { carrier: "USPS", tracking: "9400111899223400897877", label: "https://label.url/s" },
    trackingPoster: { carrier: "USPS", tracking: "9400111899223400897878", label: "https://label.url/p" },
  };

  let mockGet: jest.Mock;
  let mockUpdate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGet    = jest.fn().mockResolvedValue({ exists: true, data: () => orderWithBothLabels });
    mockUpdate = jest.fn().mockResolvedValue({});
    const mockDoc = jest.fn(() => ({ get: mockGet, update: mockUpdate }));
    (admin.firestore as unknown as jest.Mock).mockReturnValue({ doc: mockDoc });
  });

  // ── Auth & permissions ────────────────────────────────────────────────────

  it("throws unauthenticated when req.auth is null", async () => {
    await expect(
      (markSneakersReceived as any)(req({ tradeId: "t1", role: "sender" }, null))
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws permission-denied for a non-admin user", async () => {
    await expect(
      (markSneakersReceived as any)(req({ tradeId: "t1", role: "sender" }, userAuth))
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  // ── Inbound label safeguard ───────────────────────────────────────────────

  it("throws failed-precondition when the sender has no inbound label", async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...orderWithBothLabels, trackingSender: undefined }),
    });
    await expect(
      (markSneakersReceived as any)(req({ tradeId: "t1", role: "sender" }))
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("throws failed-precondition when the poster has no inbound label", async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...orderWithBothLabels, trackingPoster: undefined }),
    });
    await expect(
      (markSneakersReceived as any)(req({ tradeId: "t1", role: "poster" }))
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("throws failed-precondition when tracking number is missing from the label object", async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        ...orderWithBothLabels,
        trackingSender: { carrier: "USPS", label: "https://..." }, // no tracking field
      }),
    });
    await expect(
      (markSneakersReceived as any)(req({ tradeId: "t1", role: "sender" }))
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  // ── Successful marking ────────────────────────────────────────────────────

  it("updates sender.sneakerReceived: true when sender has a label", async () => {
    await (markSneakersReceived as any)(req({ tradeId: "t1", role: "sender" }));
    expect(mockUpdate).toHaveBeenCalledWith({ "sender.sneakerReceived": true });
  });

  it("updates poster.sneakerReceived: true when poster has a label", async () => {
    await (markSneakersReceived as any)(req({ tradeId: "t1", role: "poster" }));
    expect(mockUpdate).toHaveBeenCalledWith({ "poster.sneakerReceived": true });
  });

  it("writes an auth.sneakers_received audit log entry on success", async () => {
    await (markSneakersReceived as any)(req({ tradeId: "t1", role: "sender" }));
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "auth.sneakers_received",
      targetId: "t1",
      targetType: "order",
      status: "success",
      metadata: expect.objectContaining({ role: "sender" }),
    }));
  });

  it("returns { success: true }", async () => {
    const result = await (markSneakersReceived as any)(req({ tradeId: "t1", role: "sender" }));
    expect(result).toEqual({ success: true });
  });
});

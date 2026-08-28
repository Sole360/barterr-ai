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
  defineSecret: jest.fn(() => ({ value: () => "sk_test_key" })),
}));

jest.mock("firebase-admin/auth", () => ({
  getAuth: jest.fn(() => ({
    deleteUser: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(),
}));

jest.mock("firebase-admin/storage", () => ({
  getStorage: jest.fn(),
}));

jest.mock("stripe", () => {
  const customersDel = jest.fn();
  const accountsDel = jest.fn();
  const StripeMock = jest.fn().mockImplementation(() => ({
    customers: { del: customersDel },
    accounts: { del: accountsDel },
  }));
  (StripeMock as unknown as Record<string, unknown>).__customersDel = customersDel;
  (StripeMock as unknown as Record<string, unknown>).__accountsDel = accountsDel;
  return StripeMock;
});

jest.mock("../utils/auditLog", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import Stripe from "stripe";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { writeAuditLog } from "../utils/auditLog";
import { deleteAccount } from "../accountDeletion";

const mockCustomersDel = (Stripe as unknown as Record<string, jest.Mock>).__customersDel;
const mockAccountsDel = (Stripe as unknown as Record<string, jest.Mock>).__accountsDel;

// ─── Test harness ─────────────────────────────────────────────────────────────

const UID = "user-1";

interface FakeDoc {
  id: string;
  data: () => Record<string, unknown>;
  ref: { path: string };
  exists?: boolean;
}

const fakeDoc = (id: string, data: Record<string, unknown>, path = id): FakeDoc => ({
  id,
  data: () => data,
  ref: { path },
  exists: true,
});

const snap = (docs: FakeDoc[]) => ({ docs, size: docs.length });

// Per-test configurable query results
let tradesFrom: FakeDoc[];
let tradesTo: FakeDoc[];
let orders: FakeDoc[];
let conversations: FakeDoc[];
let sentReqs: FakeDoc[];
let receivedReqs: FakeDoc[];
let listings: FakeDoc[];
let wishlist: FakeDoc[];
let billingData: Record<string, unknown>;
let postDocs: Record<string, Record<string, unknown>>;

let mockBatchUpdate: jest.Mock;
let mockBatchDelete: jest.Mock;
let mockBatchCommit: jest.Mock;
let mockRecursiveDelete: jest.Mock;
let mockDeleteFiles: jest.Mock;
let mockDeleteUser: jest.Mock;

const req = (auth: { uid: string } | null = { uid: UID }) => ({ auth, data: {} }) as any;

beforeEach(() => {
  jest.clearAllMocks();

  tradesFrom = [];
  tradesTo = [];
  orders = [];
  conversations = [];
  sentReqs = [];
  receivedReqs = [];
  listings = [];
  wishlist = [];
  billingData = {};
  postDocs = {};

  mockBatchUpdate = jest.fn();
  mockBatchDelete = jest.fn();
  mockBatchCommit = jest.fn().mockResolvedValue(undefined);
  mockRecursiveDelete = jest.fn().mockResolvedValue(undefined);
  mockDeleteFiles = jest.fn().mockResolvedValue(undefined);
  mockDeleteUser = jest.fn().mockResolvedValue(undefined);

  mockCustomersDel.mockResolvedValue({ deleted: true });
  mockAccountsDel.mockResolvedValue({ deleted: true });

  const queryFor = (collectionName: string, field: string) => {
    switch (collectionName) {
      case "trades":
        return field === "fromUserId" ? snap(tradesFrom) : snap(tradesTo);
      case "orders":
        return snap(orders);
      case "conversations":
        return snap(conversations);
      case "tradeRequests":
        return field === "senderId" ? snap(sentReqs) : snap(receivedReqs);
      case "listings":
        return snap(listings);
      default:
        return snap([]);
    }
  };

  const mockCollection = jest.fn((name: string) => ({
    where: jest.fn((field: string) => ({
      get: jest.fn().mockResolvedValue(queryFor(name, field)),
    })),
    // wishlist subcollection is fetched without a where()
    get: jest.fn().mockResolvedValue(name === `users/${UID}/wishlist` ? snap(wishlist) : snap([])),
  }));

  const mockDocFn = jest.fn((path: string) => {
    if (path === `users/${UID}/private/billing`) {
      return { get: jest.fn().mockResolvedValue({ exists: true, data: () => billingData }) };
    }
    if (path.startsWith("posts/")) {
      const postId = path.slice("posts/".length);
      const post = postDocs[postId];
      return {
        get: jest.fn().mockResolvedValue(
          post
            ? { exists: true, data: () => post, ref: { path } }
            : { exists: false }
        ),
      };
    }
    return { path, get: jest.fn().mockResolvedValue({ exists: false }) };
  });

  (getFirestore as jest.Mock).mockReturnValue({
    collection: mockCollection,
    doc: mockDocFn,
    batch: jest.fn(() => ({
      update: mockBatchUpdate,
      delete: mockBatchDelete,
      commit: mockBatchCommit,
    })),
    recursiveDelete: mockRecursiveDelete,
  });

  (getStorage as jest.Mock).mockReturnValue({
    bucket: jest.fn(() => ({ name: "test-bucket", deleteFiles: mockDeleteFiles })),
  });

  (getAuth as jest.Mock).mockReturnValue({ deleteUser: mockDeleteUser });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("deleteAccount", () => {
  // ── Auth ──────────────────────────────────────────────────────────────────

  it("throws unauthenticated when req.auth is null", async () => {
    await expect((deleteAccount as any)(req(null)))
      .rejects.toMatchObject({ code: "unauthenticated" });
  });

  // ── Guards ────────────────────────────────────────────────────────────────

  it("blocks when the user has a trade in progress", async () => {
    tradesFrom = [fakeDoc("t1", { status: "processing" })];
    const result = await (deleteAccount as any)(req());
    expect(result).toEqual({
      blocked: true,
      blockers: [{ type: "active_trade", id: "t1" }],
    });
    expect(mockRecursiveDelete).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("blocks on a pending incoming trade too", async () => {
    tradesTo = [fakeDoc("t2", { status: "pending" })];
    const result = await (deleteAccount as any)(req());
    expect(result.blocked).toBe(true);
    expect(result.blockers).toEqual([{ type: "active_trade", id: "t2" }]);
  });

  it("blocks when an order is still in flight", async () => {
    orders = [fakeDoc("o1", { completed: false, users: [UID, "other"] })];
    const result = await (deleteAccount as any)(req());
    expect(result.blocked).toBe(true);
    expect(result.blockers).toEqual([{ type: "active_order", id: "o1" }]);
  });

  it("does not block on a cancelled order", async () => {
    orders = [fakeDoc("o1", { completed: false, status: "cancelled", users: [UID, "other"] })];
    const result = await (deleteAccount as any)(req());
    expect(result).toEqual({ success: true });
  });

  it("blocks when the wallet balance is above zero", async () => {
    billingData = { pendingPayoutCents: 4200 };
    const result = await (deleteAccount as any)(req());
    expect(result.blocked).toBe(true);
    expect(result.blockers).toEqual([{ type: "wallet_balance", amountCents: 4200 }]);
  });

  it("writes an account.deletion_blocked audit entry when blocked", async () => {
    tradesFrom = [fakeDoc("t1", { status: "both_confirmed" })];
    await (deleteAccount as any)(req());
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "account.deletion_blocked",
      actorId: UID,
      targetId: UID,
      status: "failure",
    }));
  });

  it("does not block on terminal trades (completed, declined, countered)", async () => {
    tradesFrom = [fakeDoc("t1", { status: "completed" }), fakeDoc("t2", { status: "countered" })];
    tradesTo = [fakeDoc("t3", { status: "declined" })];
    const result = await (deleteAccount as any)(req());
    expect(result).toEqual({ success: true });
  });

  // ── Anonymization ─────────────────────────────────────────────────────────

  it("scrubs the user's name and email from completed orders", async () => {
    const order = fakeDoc("o1", {
      completed: true,
      users: [UID, "other"],
      sender: { id: UID, name: "John Doe", email: "john@example.com" },
      poster: { id: "other", name: "Jane", email: "jane@example.com" },
    });
    orders = [order];
    await (deleteAccount as any)(req());
    expect(mockBatchUpdate).toHaveBeenCalledWith(order.ref, {
      "sender.name": "Deleted User",
      "sender.email": "",
    });
  });

  it("scrubs participantInfo in conversations", async () => {
    const conv = fakeDoc("c1", { participants: [UID, "other"] });
    conversations = [conv];
    await (deleteAccount as any)(req());
    expect(mockBatchUpdate).toHaveBeenCalledWith(conv.ref, {
      [`participantInfo.${UID}.displayName`]: "Deleted User",
      [`participantInfo.${UID}.photoURL`]: null,
    });
  });

  it("scrubs PII from legacy tradeRequests in both directions", async () => {
    const sent = fakeDoc("r1", { senderId: UID });
    const received = fakeDoc("r2", { posterId: UID });
    sentReqs = [sent];
    receivedReqs = [received];
    await (deleteAccount as any)(req());
    expect(mockBatchUpdate).toHaveBeenCalledWith(sent.ref, {
      senderName: "Deleted User", senderEmail: "", senderMobile: "",
    });
    expect(mockBatchUpdate).toHaveBeenCalledWith(received.ref, {
      posterName: "Deleted User", posterEmail: "", posterMobile: "",
    });
  });

  it("removes the user's owners/wishers entries from shared posts", async () => {
    listings = [fakeDoc("l1", { userId: UID, postId: "p1" })];
    postDocs["p1"] = {
      owners: [
        { userId: UID, displayName: "John", email: "john@example.com" },
        { userId: "other", displayName: "Jane", email: "jane@example.com" },
      ],
      wishers: [{ userId: UID, displayName: "John", email: "john@example.com" }],
    };
    await (deleteAccount as any)(req());
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ path: "posts/p1" }),
      {
        owners: [{ userId: "other", displayName: "Jane", email: "jane@example.com" }],
        wishers: [],
      }
    );
  });

  it("finds posts via the wishlist when the user has no listing for them", async () => {
    wishlist = [fakeDoc("p2_10", { postId: "p2", size: 10 })];
    postDocs["p2"] = {
      owners: [{ userId: "other", displayName: "Jane" }],
      wishers: [{ userId: UID, displayName: "John", email: "john@example.com" }],
    };
    await (deleteAccount as any)(req());
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ path: "posts/p2" }),
      {
        owners: [{ userId: "other", displayName: "Jane" }],
        wishers: [],
      }
    );
  });

  // ── Deletion ──────────────────────────────────────────────────────────────

  it("deletes the user's listings", async () => {
    const l1 = fakeDoc("l1", { userId: UID, postId: "p1" });
    const l2 = fakeDoc("l2", { userId: UID });
    listings = [l1, l2];
    await (deleteAccount as any)(req());
    expect(mockBatchDelete).toHaveBeenCalledWith(l1.ref);
    expect(mockBatchDelete).toHaveBeenCalledWith(l2.ref);
  });

  it("deletes user storage prefixes but never training-data", async () => {
    await (deleteAccount as any)(req());
    expect(mockDeleteFiles).toHaveBeenCalledWith({ prefix: `users/${UID}/` });
    expect(mockDeleteFiles).toHaveBeenCalledWith({ prefix: `sneaker_uploads/${UID}/` });
    const prefixes = mockDeleteFiles.mock.calls.map((c) => c[0].prefix);
    expect(prefixes.some((p: string) => p.includes("training-data"))).toBe(false);
  });

  it("recursively deletes the users doc and deletes the auth account", async () => {
    await (deleteAccount as any)(req());
    expect(mockRecursiveDelete).toHaveBeenCalledTimes(1);
    expect(mockDeleteUser).toHaveBeenCalledWith(UID);
  });

  // ── Stripe ────────────────────────────────────────────────────────────────

  it("deletes the Stripe customer and Connect account when present", async () => {
    billingData = { stripeCustomerId: "cus_123", stripeConnectAccountId: "acct_456" };
    await (deleteAccount as any)(req());
    expect(mockCustomersDel).toHaveBeenCalledWith("cus_123");
    expect(mockAccountsDel).toHaveBeenCalledWith("acct_456");
  });

  it("skips Stripe entirely when no billing IDs exist", async () => {
    await (deleteAccount as any)(req());
    expect(mockCustomersDel).not.toHaveBeenCalled();
    expect(mockAccountsDel).not.toHaveBeenCalled();
  });

  it("completes the purge even when Stripe deletion fails", async () => {
    billingData = { stripeCustomerId: "cus_123" };
    mockCustomersDel.mockRejectedValue(new Error("Stripe down"));
    const result = await (deleteAccount as any)(req());
    expect(result).toEqual({ success: true });
    expect(mockRecursiveDelete).toHaveBeenCalled();
    expect(mockDeleteUser).toHaveBeenCalledWith(UID);
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        stripeErrors: ["customer: Stripe down"],
      }),
    }));
  });

  // ── Audit ─────────────────────────────────────────────────────────────────

  it("writes an account.purged audit entry with purge counts", async () => {
    listings = [fakeDoc("l1", { userId: UID })];
    conversations = [fakeDoc("c1", { participants: [UID, "other"] })];
    await (deleteAccount as any)(req());
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "account.purged",
      functionName: "deleteAccount",
      actorId: UID,
      targetId: UID,
      targetType: "user",
      status: "success",
      metadata: expect.objectContaining({
        listingsDeleted: 1,
        conversationsScrubbed: 1,
      }),
    }));
  });

  it("returns { success: true } on a clean purge", async () => {
    const result = await (deleteAccount as any)(req());
    expect(result).toEqual({ success: true });
  });
});

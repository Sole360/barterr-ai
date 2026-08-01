// ─── Module mocks (hoisted by ts-jest before any imports) ────────────────────

jest.mock("firebase-functions/v2/firestore", () => ({
  onDocumentCreated: (_: unknown, handler: unknown) => handler,
}));

jest.mock("firebase-functions/v2", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  setGlobalOptions: jest.fn(),
}));

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(),
}));

// Prevent admin.initializeApp() from erroring when recommendationEngine is imported
jest.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn(), {
    FieldValue: { serverTimestamp: jest.fn(() => "SERVER_TIMESTAMP") },
  }),
}));

// recommendationEngine calls Algolia — mock it so unit tests stay local
jest.mock("../recommendationEngine", () => ({
  triggerRecommendationRefresh: jest.fn().mockResolvedValue(undefined),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onSwipeCreated, onWishlistCreated } from "../preferenceEngine";
import { triggerRecommendationRefresh } from "../recommendationEngine";

// ─── Constants — must match preferenceEngine.ts ───────────────────────────────

const ALPHA: Record<string, number> = {
  trade_accepted: 0.40,
  want:           0.35,
  like:           0.25,
  pass:           0.15,
  trade_declined: 0.15,
};

const SIGNAL: Record<string, number> = {
  trade_accepted: 0.95,
  want:           0.85,
  like:           0.70,
  pass:           0.25,
  trade_declined: 0.20,
};

function ema(signalType: string, current = 0.5): number {
  return ALPHA[signalType] * SIGNAL[signalType] + (1 - ALPHA[signalType]) * current;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSwipeEvent(userId: string, styleId: string, data: Record<string, unknown> | null) {
  return {
    params: { userId, styleId },
    data: data ? { data: () => data } : null,
  } as any;
}

function makeWishlistEvent(userId: string, data: Record<string, unknown> | null) {
  return {
    params: { userId, wishlistId: "postId_10" },
    data: data ? { data: () => data } : null,
  } as any;
}

interface FirestoreOpts {
  brands?: Record<string, number>;
  sneakers?: Record<string, number>;
  recentLikes?: any[];
  postData?: Record<string, unknown> | null;
}

function setupFirestore({
  brands = {},
  sneakers = {},
  recentLikes = [],
  postData = null,
}: FirestoreOpts = {}) {
  const mockUpdate = jest.fn().mockResolvedValue({});
  const mockUserGet = jest.fn().mockResolvedValue({
    data: () => ({ preferences: { brands, sneakers }, recentLikes }),
  });
  const mockPostGet = jest.fn().mockResolvedValue({ data: () => postData });

  const userRef = { get: mockUserGet, update: mockUpdate };
  const postRef = { get: mockPostGet };

  (getFirestore as jest.Mock).mockReturnValue({
    collection: () => ({ doc: () => userRef }),
    doc: (path: string) => (path.startsWith("posts/") ? postRef : userRef),
  });

  return { mockUpdate, mockUserGet, mockPostGet };
}

// ─── onSwipeCreated ───────────────────────────────────────────────────────────

describe("onSwipeCreated — EMA preference engine", () => {
  beforeEach(() => jest.clearAllMocks());

  // Early exits

  it("returns null when event.data is missing", async () => {
    expect(await (onSwipeCreated as any)(makeSwipeEvent("u1", "s1", null))).toBeNull();
  });

  it("returns null for unknown result", async () => {
    setupFirestore();
    expect(await (onSwipeCreated as any)(makeSwipeEvent("u1", "s1", { result: "unknown", brand: "Nike" }))).toBeNull();
  });

  it("returns null when brand is empty", async () => {
    setupFirestore();
    expect(await (onSwipeCreated as any)(makeSwipeEvent("u1", "s1", { result: "like", brand: "" }))).toBeNull();
  });

  // EMA math from neutral (0.5)

  it("applies correct EMA for 'want' from neutral 0.5", async () => {
    const { mockUpdate } = setupFirestore();
    await (onSwipeCreated as any)(makeSwipeEvent("u1", "CV2211-001", { result: "want", brand: "Nike" }));
    const arg = mockUpdate.mock.calls[0][0];
    expect(arg["preferences.brands.Nike"]).toBeCloseTo(ema("want"), 5);
    expect(arg["preferences.sneakers.CV2211-001"]).toBeCloseTo(ema("want"), 5);
  });

  it("applies correct EMA for 'like' from neutral 0.5", async () => {
    const { mockUpdate } = setupFirestore();
    await (onSwipeCreated as any)(makeSwipeEvent("u1", "EG4958-001", { result: "like", brand: "Adidas" }));
    const arg = mockUpdate.mock.calls[0][0];
    expect(arg["preferences.brands.Adidas"]).toBeCloseTo(ema("like"), 5);
    expect(arg["preferences.sneakers.EG4958-001"]).toBeCloseTo(ema("like"), 5);
  });

  it("applies correct EMA for 'pass' — mild negative, not zero", async () => {
    const { mockUpdate } = setupFirestore();
    await (onSwipeCreated as any)(makeSwipeEvent("u1", "DV0831-101", { result: "pass", brand: "Jordan" }));
    const arg = mockUpdate.mock.calls[0][0];
    expect(arg["preferences.brands.Jordan"]).toBeCloseTo(ema("pass"), 5);
    // Must stay well above 0 — the old bug was signal=0.0 trending to zero
    expect(arg["preferences.brands.Jordan"]).toBeGreaterThan(0.4);
  });

  // EMA — accumulated weights

  it("builds on an existing brand + sneaker weight rather than resetting to 0.5", async () => {
    const { mockUpdate } = setupFirestore({ brands: { Nike: 0.8 }, sneakers: { "CV2211-001": 0.75 } });
    await (onSwipeCreated as any)(makeSwipeEvent("u1", "CV2211-001", { result: "like", brand: "Nike" }));
    const arg = mockUpdate.mock.calls[0][0];
    expect(arg["preferences.brands.Nike"]).toBeCloseTo(ema("like", 0.8), 5);
    expect(arg["preferences.sneakers.CV2211-001"]).toBeCloseTo(ema("like", 0.75), 5);
  });

  it("lowers both brand and sneaker weight after a pass", async () => {
    const { mockUpdate } = setupFirestore({ brands: { Nike: 0.9 }, sneakers: { "CV2211-001": 0.88 } });
    await (onSwipeCreated as any)(makeSwipeEvent("u1", "CV2211-001", { result: "pass", brand: "Nike" }));
    const arg = mockUpdate.mock.calls[0][0];
    expect(arg["preferences.brands.Nike"]).toBeLessThan(0.9);
    expect(arg["preferences.sneakers.CV2211-001"]).toBeLessThan(0.88);
  });

  // Two-level write

  it("writes both brand and sneaker levels in a single update call", async () => {
    const { mockUpdate } = setupFirestore();
    await (onSwipeCreated as any)(makeSwipeEvent("u1", "CV2211-001", { result: "want", brand: "Nike" }));
    const arg = mockUpdate.mock.calls[0][0];
    expect(arg).toHaveProperty(["preferences.brands.Nike"]);
    expect(arg).toHaveProperty(["preferences.sneakers.CV2211-001"]);
  });

  it("uses dot-notation to avoid overwriting other brands", async () => {
    const { mockUpdate } = setupFirestore({ brands: { Adidas: 0.7 } });
    await (onSwipeCreated as any)(makeSwipeEvent("u1", "s1", { result: "want", brand: "Nike" }));
    const arg = mockUpdate.mock.calls[0][0];
    expect(arg).toHaveProperty(["preferences.brands.Nike"]);
    expect(arg).not.toHaveProperty(["preferences"]);
  });

  // recentLikes — second update call (after updatePreference)

  it("adds to recentLikes for 'like' in the second update call", async () => {
    const { mockUpdate } = setupFirestore();
    await (onSwipeCreated as any)(makeSwipeEvent("u1", "style-abc", {
      result: "like", brand: "Nike", productName: "Nike Dunk Low", imageUrl: "https://img.test/dunk.jpg",
    }));
    const recentLikesArg = mockUpdate.mock.calls[1][0];
    expect(recentLikesArg.recentLikes).toHaveLength(1);
    expect(recentLikesArg.recentLikes[0]).toMatchObject({ styleId: "style-abc", brand: "Nike" });
  });

  it("adds to recentLikes for 'want'", async () => {
    const { mockUpdate } = setupFirestore();
    await (onSwipeCreated as any)(makeSwipeEvent("u1", "style-xyz", {
      result: "want", brand: "Jordan", productName: "Jordan 1", imageUrl: "https://img.test/j1.jpg",
    }));
    const recentLikesArg = mockUpdate.mock.calls[1][0];
    expect(recentLikesArg.recentLikes[0].styleId).toBe("style-xyz");
  });

  it("does NOT write recentLikes for 'pass' — only one update call", async () => {
    const { mockUpdate } = setupFirestore();
    await (onSwipeCreated as any)(makeSwipeEvent("u1", "s1", { result: "pass", brand: "Nike" }));
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).not.toHaveProperty("recentLikes");
  });

  it("caps recentLikes at 5 and deduplicates by styleId", async () => {
    const existing = [
      { styleId: "a", brand: "Nike", productName: "A", imageUrl: "" },
      { styleId: "b", brand: "Adidas", productName: "B", imageUrl: "" },
      { styleId: "c", brand: "Jordan", productName: "C", imageUrl: "" },
      { styleId: "d", brand: "Puma", productName: "D", imageUrl: "" },
      { styleId: "e", brand: "Vans", productName: "E", imageUrl: "" },
    ];
    const { mockUpdate } = setupFirestore({ recentLikes: existing });
    await (onSwipeCreated as any)(makeSwipeEvent("u1", "style-new", {
      result: "like", brand: "New Balance", productName: "NB 550", imageUrl: "",
    }));
    const recentLikesArg = mockUpdate.mock.calls[1][0];
    expect(recentLikesArg.recentLikes).toHaveLength(5);
    expect(recentLikesArg.recentLikes[0].styleId).toBe("style-new");
    expect(recentLikesArg.recentLikes.map((l: any) => l.styleId)).not.toContain("e");
  });

  // Error handling

  it("logs an error but does not throw when Firestore fails", async () => {
    const mockGet = jest.fn().mockRejectedValue(new Error("Firestore down"));
    (getFirestore as jest.Mock).mockReturnValue({
      collection: () => ({ doc: () => ({ get: mockGet, update: jest.fn() }) }),
      doc: () => ({ get: mockGet, update: jest.fn() }),
    });
    await expect(
      (onSwipeCreated as any)(makeSwipeEvent("u1", "s1", { result: "like", brand: "Nike" }))
    ).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });
});

// ─── onWishlistCreated ────────────────────────────────────────────────────────

describe("onWishlistCreated — high-intent want signal", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns null when postId is missing from wishlist doc", async () => {
    setupFirestore();
    expect(await (onWishlistCreated as any)(makeWishlistEvent("u1", { size: 10 }))).toBeNull();
  });

  it("returns null and warns when post is missing brand or styleId", async () => {
    setupFirestore({ postData: { name: "Air Max" } }); // no brand/styleId
    expect(await (onWishlistCreated as any)(makeWishlistEvent("u1", { postId: "p1", size: 10 }))).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("applies 'want' signal for both brand and sneaker on happy path", async () => {
    const { mockUpdate } = setupFirestore({ postData: { brand: "Nike", styleId: "CV2211-001" } });
    await (onWishlistCreated as any)(makeWishlistEvent("u1", { postId: "p1", size: 10 }));
    const arg = mockUpdate.mock.calls[0][0];
    expect(arg["preferences.brands.Nike"]).toBeCloseTo(ema("want"), 5);
    expect(arg["preferences.sneakers.CV2211-001"]).toBeCloseTo(ema("want"), 5);
  });

  it("triggers a recommendation refresh", async () => {
    setupFirestore({ postData: { brand: "Nike", styleId: "CV2211-001" } });
    await (onWishlistCreated as any)(makeWishlistEvent("u1", { postId: "p1", size: 10 }));
    expect(triggerRecommendationRefresh).toHaveBeenCalledWith("u1");
  });

  it("builds on existing preference weights rather than resetting to 0.5", async () => {
    const { mockUpdate } = setupFirestore({
      brands: { Nike: 0.6 },
      sneakers: { "CV2211-001": 0.55 },
      postData: { brand: "Nike", styleId: "CV2211-001" },
    });
    await (onWishlistCreated as any)(makeWishlistEvent("u1", { postId: "p1", size: 10 }));
    const arg = mockUpdate.mock.calls[0][0];
    expect(arg["preferences.brands.Nike"]).toBeCloseTo(ema("want", 0.6), 5);
    expect(arg["preferences.sneakers.CV2211-001"]).toBeCloseTo(ema("want", 0.55), 5);
  });

  it("does not update unrelated sneaker styleIds", async () => {
    const { mockUpdate } = setupFirestore({ postData: { brand: "Jordan", styleId: "DD1391-100" } });
    await (onWishlistCreated as any)(makeWishlistEvent("u1", { postId: "p2", size: 10 }));
    const arg = mockUpdate.mock.calls[0][0];
    expect(arg).toHaveProperty(["preferences.sneakers.DD1391-100"]);
    expect(arg).not.toHaveProperty(["preferences.sneakers.CV2211-001"]);
  });
});

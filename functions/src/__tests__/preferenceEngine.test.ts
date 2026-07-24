// ─── Module mocks (hoisted by ts-jest before any imports) ────────────────────

jest.mock("firebase-functions/v2/firestore", () => ({
  onDocumentCreated: (_path: unknown, handler: unknown) => handler,
}));

jest.mock("firebase-functions/v2", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
  setGlobalOptions: jest.fn(),
}));

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onSwipeCreated } from "../preferenceEngine";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALPHA = 0.3;

/** Build a fake onDocumentCreated event */
function makeEvent(
  userId: string,
  styleId: string,
  data: Record<string, unknown> | null
) {
  return {
    params: { userId, styleId },
    data: data
      ? { data: () => data }
      : null,
  } as any;
}

/** Wire up Firestore mocks; returns the update spy */
function setupFirestore(existingBrands: Record<string, number> = {}) {
  const mockUpdate = jest.fn().mockResolvedValue({});
  const mockGet = jest.fn().mockResolvedValue({
    data: () => ({ preferences: { brands: existingBrands } }),
  });
  const mockDoc = jest.fn(() => ({ get: mockGet, update: mockUpdate }));
  const mockCollection = jest.fn(() => ({ doc: mockDoc }));
  (getFirestore as jest.Mock).mockReturnValue({ collection: mockCollection, doc: jest.fn(() => ({ get: mockGet, update: mockUpdate })) });

  // Shortcut: userRef.update is the same mock regardless of collection chain
  (getFirestore as jest.Mock).mockReturnValue({
    collection: () => ({
      doc: () => ({ get: mockGet, update: mockUpdate }),
    }),
  });

  return { mockUpdate, mockGet };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("onSwipeCreated — preference engine EMA", () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Early exits ────────────────────────────────────────────────────────────

  it("returns null when event.data is missing", async () => {
    const result = await (onSwipeCreated as any)(makeEvent("u1", "style-1", null));
    expect(result).toBeNull();
  });

  it("returns null when result field is unknown", async () => {
    setupFirestore();
    const result = await (onSwipeCreated as any)(
      makeEvent("u1", "style-1", { result: "unknown", brand: "Nike" })
    );
    expect(result).toBeNull();
  });

  it("returns null when brand is empty", async () => {
    setupFirestore();
    const result = await (onSwipeCreated as any)(
      makeEvent("u1", "style-1", { result: "like", brand: "" })
    );
    expect(result).toBeNull();
  });

  // ── EMA math — neutral start (0.5 default) ────────────────────────────────

  it("applies correct EMA for 'want' (signal=1.0) from neutral 0.5", async () => {
    const { mockUpdate } = setupFirestore();
    await (onSwipeCreated as any)(
      makeEvent("u1", "style-1", { result: "want", brand: "Nike" })
    );
    // newWeight = 0.3 * 1.0 + 0.7 * 0.5 = 0.65
    const expected = ALPHA * 1.0 + (1 - ALPHA) * 0.5;
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ "preferences.brands.Nike": expect.closeTo(expected, 5) })
    );
  });

  it("applies correct EMA for 'like' (signal=0.8) from neutral 0.5", async () => {
    const { mockUpdate } = setupFirestore();
    await (onSwipeCreated as any)(
      makeEvent("u1", "style-1", { result: "like", brand: "Adidas" })
    );
    // newWeight = 0.3 * 0.8 + 0.7 * 0.5 = 0.59
    const expected = ALPHA * 0.8 + (1 - ALPHA) * 0.5;
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ "preferences.brands.Adidas": expect.closeTo(expected, 5) })
    );
  });

  it("applies correct EMA for 'pass' (signal=0.0) from neutral 0.5", async () => {
    const { mockUpdate } = setupFirestore();
    await (onSwipeCreated as any)(
      makeEvent("u1", "style-1", { result: "pass", brand: "Jordan" })
    );
    // newWeight = 0.3 * 0.0 + 0.7 * 0.5 = 0.35
    const expected = ALPHA * 0.0 + (1 - ALPHA) * 0.5;
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ "preferences.brands.Jordan": expect.closeTo(expected, 5) })
    );
  });

  // ── EMA math — accumulated weight ─────────────────────────────────────────

  it("builds on an existing brand weight rather than resetting to 0.5", async () => {
    const { mockUpdate } = setupFirestore({ Nike: 0.8 });
    await (onSwipeCreated as any)(
      makeEvent("u1", "style-1", { result: "like", brand: "Nike" })
    );
    // current = 0.8; newWeight = 0.3 * 0.8 + 0.7 * 0.8 = 0.8 (stable)
    const expected = ALPHA * 0.8 + (1 - ALPHA) * 0.8;
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ "preferences.brands.Nike": expect.closeTo(expected, 5) })
    );
  });

  it("lowers a high brand weight after a pass", async () => {
    const { mockUpdate } = setupFirestore({ Nike: 0.9 });
    await (onSwipeCreated as any)(
      makeEvent("u1", "style-1", { result: "pass", brand: "Nike" })
    );
    // newWeight = 0.3 * 0.0 + 0.7 * 0.9 = 0.63
    const expected = ALPHA * 0.0 + (1 - ALPHA) * 0.9;
    const call = mockUpdate.mock.calls[0][0];
    expect(call["preferences.brands.Nike"]).toBeCloseTo(expected, 5);
    expect(call["preferences.brands.Nike"]).toBeLessThan(0.9);
  });

  // ── Field targeting ────────────────────────────────────────────────────────

  it("uses dot-notation field path to avoid overwriting other brands", async () => {
    const { mockUpdate } = setupFirestore({ Adidas: 0.7 });
    await (onSwipeCreated as any)(
      makeEvent("u1", "style-1", { result: "want", brand: "Nike" })
    );
    // Brand update must be a flat dot-notation string key, not a nested object
    const updateArg = mockUpdate.mock.calls[0][0];
    // Use array form so Jest treats the dot as a literal character, not path traversal
    expect(updateArg).toHaveProperty(["preferences.brands.Nike"]);
    expect(updateArg).not.toHaveProperty(["preferences"]); // no nested overwrite
  });

  // ── recentLikes ────────────────────────────────────────────────────────────

  it("adds to recentLikes for 'like' swipes", async () => {
    const { mockUpdate } = setupFirestore();
    await (onSwipeCreated as any)(
      makeEvent("u1", "style-abc", { result: "like", brand: "Nike", productName: "Nike Dunk Low", imageUrl: "https://img.test/dunk.jpg" })
    );
    const updateArg = mockUpdate.mock.calls[0][0];
    expect(updateArg.recentLikes).toHaveLength(1);
    expect(updateArg.recentLikes[0]).toMatchObject({ styleId: "style-abc", brand: "Nike" });
  });

  it("adds to recentLikes for 'want' swipes", async () => {
    const { mockUpdate } = setupFirestore();
    await (onSwipeCreated as any)(
      makeEvent("u1", "style-xyz", { result: "want", brand: "Jordan", productName: "Jordan 1", imageUrl: "https://img.test/j1.jpg" })
    );
    const updateArg = mockUpdate.mock.calls[0][0];
    expect(updateArg.recentLikes).toBeDefined();
    expect(updateArg.recentLikes[0].styleId).toBe("style-xyz");
  });

  it("does NOT add to recentLikes for 'pass' swipes", async () => {
    const { mockUpdate } = setupFirestore();
    await (onSwipeCreated as any)(
      makeEvent("u1", "style-1", { result: "pass", brand: "Nike" })
    );
    const updateArg = mockUpdate.mock.calls[0][0];
    expect(updateArg).not.toHaveProperty("recentLikes");
  });

  it("caps recentLikes at 5 and deduplicates by styleId", async () => {
    const existing = [
      { styleId: "a", brand: "Nike", productName: "A", imageUrl: "" },
      { styleId: "b", brand: "Adidas", productName: "B", imageUrl: "" },
      { styleId: "c", brand: "Jordan", productName: "C", imageUrl: "" },
      { styleId: "d", brand: "Puma", productName: "D", imageUrl: "" },
      { styleId: "e", brand: "Vans", productName: "E", imageUrl: "" },
    ];
    // setupFirestore needs to return existing recentLikes on the user doc
    const mockUpdate = jest.fn().mockResolvedValue({});
    const mockGet = jest.fn().mockResolvedValue({
      data: () => ({ preferences: { brands: {} }, recentLikes: existing }),
    });
    (getFirestore as jest.Mock).mockReturnValue({
      collection: () => ({ doc: () => ({ get: mockGet, update: mockUpdate }) }),
    });

    await (onSwipeCreated as any)(
      makeEvent("u1", "style-new", { result: "like", brand: "New Balance", productName: "NB 550", imageUrl: "" })
    );
    const updateArg = mockUpdate.mock.calls[0][0];
    expect(updateArg.recentLikes).toHaveLength(5);
    expect(updateArg.recentLikes[0].styleId).toBe("style-new"); // newest first
    expect(updateArg.recentLikes.map((l: any) => l.styleId)).not.toContain("e"); // oldest dropped
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  it("logs an error but does not throw when Firestore fails", async () => {
    const mockGet = jest.fn().mockRejectedValue(new Error("Firestore down"));
    (getFirestore as jest.Mock).mockReturnValue({
      collection: () => ({ doc: () => ({ get: mockGet, update: jest.fn() }) }),
    });
    await expect(
      (onSwipeCreated as any)(makeEvent("u1", "style-1", { result: "like", brand: "Nike" }))
    ).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });
});

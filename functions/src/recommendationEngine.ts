import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { algoliasearch } from "algoliasearch";

if (!admin.apps.length) {
  admin.initializeApp();
}

const ALGOLIA_INDEX = "user_POSTS";
const DEBOUNCE_MINUTES = 10;
const MAX_LISTING_CANDIDATES = 40;
const MAX_LISTING_RESULTS = 20;
const MAX_PARTNER_CANDIDATES = 50;
const MAX_PARTNER_RESULTS = 10;

interface UserPreferences {
  brands?: Record<string, number>;
  sneakers?: Record<string, number>;
}

interface AlgoliaHit {
  objectID: string;
  postId?: string;
  brand?: string;
  styleId?: string;
  productName?: string;
  productImageUrl?: string;
  size?: number;
  userId?: string;
  approvalStatus?: string;
}

interface RecommendedListing {
  postId: string;
  brand: string;
  styleId: string;
  productName: string;
  productImageUrl: string;
  score: number;
}

interface RecommendedPartner {
  userId: string;
  displayName: string;
  photoURL: string | null;
  score: number;
  sharedBrands: string[];
}

function getAlgoliaClient() {
  const appId = process.env.ALGOLIA_APP_ID;
  const apiKey = process.env.ALGOLIA_ADMIN_API_KEY;
  if (!appId || !apiKey) throw new Error("Missing Algolia env vars");
  return algoliasearch(appId, apiKey);
}

/**
 * Returns true if the cached recommendations are fresh enough to skip recomputation.
 */
async function isRecentlyComputed(uid: string): Promise<boolean> {
  const db = admin.firestore();
  const snap = await db.doc(`users/${uid}/cachedRecommendations/listings`).get();
  if (!snap.exists) return false;
  const computedAt = snap.data()?.computedAt as admin.firestore.Timestamp | undefined;
  if (!computedAt) return false;
  const ageMinutes = (Date.now() - computedAt.toMillis()) / 60000;
  return ageMinutes < DEBOUNCE_MINUTES;
}

async function computeListingRecommendations(
  uid: string,
  preferences: UserPreferences,
  shoeSize?: number
): Promise<RecommendedListing[]> {
  const brands = preferences.brands ?? {};
  const sneakers = preferences.sneakers ?? {};

  // Top brands with above-neutral affinity
  const topBrands = Object.entries(brands)
    .sort(([, a], [, b]) => b - a)
    .filter(([, w]) => w > 0.45)
    .slice(0, 6)
    .map(([b]) => b);

  if (topBrands.length === 0) return [];

  try {
    const client = getAlgoliaClient();
    const brandFilter = topBrands.map((b) => `brand:"${b}"`).join(" OR ");

    const { hits } = await client.searchSingleIndex<AlgoliaHit>({
      indexName: ALGOLIA_INDEX,
      searchParams: {
        query: "",
        filters: `(${brandFilter}) AND approvalStatus:approved`,
        hitsPerPage: MAX_LISTING_CANDIDATES,
      },
    });

    const scored: RecommendedListing[] = (hits as AlgoliaHit[])
      .filter((h) => h.userId !== uid && h.postId)
      .map((h) => {
        const sneakerScore = sneakers[h.styleId ?? ""] ?? 0.5;
        const brandScore = brands[h.brand ?? ""] ?? 0.5;
        const sizeBoost = shoeSize && h.size === shoeSize ? 15 : 0;
        return {
          postId: h.postId ?? h.objectID,
          brand: h.brand ?? "",
          styleId: h.styleId ?? "",
          productName: h.productName ?? "",
          productImageUrl: h.productImageUrl ?? "",
          score: sneakerScore * 40 + brandScore * 35 + sizeBoost,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_LISTING_RESULTS);

    return scored;
  } catch (err) {
    logger.error("recommendationEngine: listing query failed:", err);
    return [];
  }
}

async function computePartnerRecommendations(
  uid: string,
  preferences: UserPreferences,
  shoeSize?: number
): Promise<RecommendedPartner[]> {
  const brands = preferences.brands ?? {};

  const topBrands = Object.entries(brands)
    .sort(([, a], [, b]) => b - a)
    .filter(([, w]) => w > 0.55)
    .slice(0, 4)
    .map(([b]) => b);

  if (topBrands.length === 0 || !shoeSize) return [];

  try {
    const client = getAlgoliaClient();
    const brandFilter = topBrands.map((b) => `brand:"${b}"`).join(" OR ");

    const { hits } = await client.searchSingleIndex<AlgoliaHit>({
      indexName: ALGOLIA_INDEX,
      searchParams: {
        query: "",
        filters: `(${brandFilter}) AND size:${shoeSize} AND approvalStatus:approved`,
        hitsPerPage: MAX_PARTNER_CANDIDATES,
      },
    });

    // Group by userId, accumulate brand affinity score
    const userScores: Record<string, { score: number; brands: Set<string> }> = {};
    for (const hit of hits as AlgoliaHit[]) {
      if (!hit.userId || hit.userId === uid) continue;
      if (!userScores[hit.userId]) {
        userScores[hit.userId] = { score: 0, brands: new Set() };
      }
      userScores[hit.userId].score += brands[hit.brand ?? ""] ?? 0.5;
      if (hit.brand) userScores[hit.userId].brands.add(hit.brand);
    }

    const topUids = Object.entries(userScores)
      .sort(([, a], [, b]) => b.score - a.score)
      .slice(0, MAX_PARTNER_RESULTS)
      .map(([u]) => u);

    if (topUids.length === 0) return [];

    // Batch fetch user display info
    const db = admin.firestore();
    const userSnaps = await db.getAll(
      ...topUids.map((u) => db.doc(`users/${u}`))
    );

    const userMap: Record<string, { displayName: string; photoURL: string | null }> = {};
    userSnaps.forEach((snap) => {
      const d = snap.data();
      userMap[snap.id] = {
        displayName: d?.displayName ?? d?.firstName ?? "",
        photoURL: d?.photoURL ?? null,
      };
    });

    return topUids.map((partnerUid) => ({
      userId: partnerUid,
      displayName: userMap[partnerUid]?.displayName ?? "",
      photoURL: userMap[partnerUid]?.photoURL ?? null,
      score: userScores[partnerUid].score,
      sharedBrands: [...userScores[partnerUid].brands].slice(0, 3),
    }));
  } catch (err) {
    logger.error("recommendationEngine: partner query failed:", err);
    return [];
  }
}

/**
 * Core computation — called internally from signal handlers.
 * Skips if recommendations were computed less than DEBOUNCE_MINUTES ago.
 */
export async function triggerRecommendationRefresh(uid: string): Promise<void> {
  if (await isRecentlyComputed(uid)) {
    logger.info(`recommendationEngine: skipping refresh for ${uid} (recently computed)`);
    return;
  }

  const db = admin.firestore();
  const userSnap = await db.doc(`users/${uid}`).get();
  const userData = userSnap.data();
  if (!userData) return;

  const preferences: UserPreferences = userData.preferences ?? {};
  const shoeSize: number | undefined = userData.shoeSize;

  const [listings, partners] = await Promise.all([
    computeListingRecommendations(uid, preferences, shoeSize),
    computePartnerRecommendations(uid, preferences, shoeSize),
  ]);

  const now = admin.firestore.FieldValue.serverTimestamp();

  await Promise.all([
    db.doc(`users/${uid}/cachedRecommendations/listings`).set({
      items: listings,
      computedAt: now,
    }),
    db.doc(`users/${uid}/cachedRecommendations/partners`).set({
      items: partners,
      computedAt: now,
    }),
  ]);

  logger.info(
    `recommendationEngine: refreshed for ${uid} — ` +
    `${listings.length} listings, ${partners.length} partners`
  );
}

/**
 * refreshRecommendations — callable from frontend.
 * Called on login when cache is stale (>24h). Returns immediately;
 * computation runs in the same invocation but client doesn't wait.
 */
export const refreshRecommendations = onCall(
  {
    region: "us-central1",
    invoker: "public",
    secrets: ["ALGOLIA_APP_ID", "ALGOLIA_ADMIN_API_KEY"],
    cors: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://barterr.ai",
      "https://dev.barterr.ai",
    ],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Must be signed in.");

    // Fire-and-forget — don't await so the client gets a fast response
    triggerRecommendationRefresh(uid).catch((err) =>
      logger.error("refreshRecommendations background error:", err)
    );

    return { queued: true };
  }
);

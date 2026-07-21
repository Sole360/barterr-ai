/**
 * One-time re-index script — pushes all Firestore listings + users into Algolia.
 *
 * Usage:
 *   1. Make sure scripts/serviceAccountKey.json exists (same key used for set-super-admin)
 *   2. Set your new Algolia Admin API Key:
 *        export ALGOLIA_ADMIN_API_KEY=your_admin_key_here
 *   3. Run:
 *        node scripts/reindex-algolia.js
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const fnRequire = createRequire(join(repoRoot, "functions", "package.json"));
const { initializeApp, cert } = fnRequire("firebase-admin/app");
const { getFirestore } = fnRequire("firebase-admin/firestore");
const { algoliasearch } = fnRequire("algoliasearch");

const localRequire = createRequire(import.meta.url);
const serviceAccount = localRequire(join(__dirname, "serviceAccountKey.json"));

const ALGOLIA_APP_ID = "QSCURMJ88X";
const ALGOLIA_ADMIN_API_KEY = process.env.ALGOLIA_ADMIN_API_KEY;

if (!ALGOLIA_ADMIN_API_KEY) {
  console.error("Error: ALGOLIA_ADMIN_API_KEY environment variable is not set.");
  console.error("  Run: export ALGOLIA_ADMIN_API_KEY=your_admin_key_here");
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const algolia = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY);

async function reindexListings() {
  console.log("Fetching listings from Firestore...");
  const snap = await db.collection("listings").get();

  const objects = [];
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();

    // Only index approved, active listings
    if (data.approvalStatus !== "approved" || data.active === false) {
      skipped++;
      continue;
    }

    objects.push({
      objectID: doc.id,
      productName: data.productName ?? "",
      brand: data.brand ?? "",
      styleId: data.styleId ?? "",
      size: data.size ?? null,
      productImageUrl: data.productImageUrl ?? "",
      apiID: data.apiID ?? "",
      active: data.active ?? true,
      postedAt: data.postedAt?.seconds ?? Math.floor(Date.now() / 1000),
      updatedAt: data.updatedAt?.seconds ?? Math.floor(Date.now() / 1000),
    });
  }

  if (objects.length === 0) {
    console.log(`  No approved listings to index (${skipped} skipped).`);
    return;
  }

  await algolia.saveObjects({ indexName: "user_POSTS", objects });
  console.log(`  ✓ Indexed ${objects.length} listings (${skipped} skipped — not approved or inactive).`);
}

async function reindexUsers() {
  console.log("Fetching users from Firestore...");
  const snap = await db.collection("users").get();

  const objects = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      objectID: doc.id,
      displayName: data.displayName ?? "",
      photoURL: data.photoURL ?? "",
      location: data.location ?? "",
    };
  });

  if (objects.length === 0) {
    console.log("  No users to index.");
    return;
  }

  await algolia.saveObjects({ indexName: "barterr_users", objects });
  console.log(`  ✓ Indexed ${objects.length} users.`);
}

async function configureListingsIndex() {
  console.log("Configuring user_POSTS index settings...");
  await algolia.setSettings({
    indexName: "user_POSTS",
    indexSettings: {
      // brand must be facetable for string filters to work; size uses filterOnly
      // since we don't need facet counts for it (numeric range queries work without).
      attributesForFaceting: ["brand", "filterOnly(size)"],
    },
  });
  console.log("  ✓ attributesForFaceting set.");
}

try {
  await configureListingsIndex();
  await reindexListings();
  await reindexUsers();
  console.log("\nDone. Index configured and both indexes are up to date.");
  process.exit(0);
} catch (err) {
  console.error("\nError during re-index:", err.message);
  process.exit(1);
}

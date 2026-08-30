/**
 * One-time bootstrap script — sets the first super_admin custom claim.
 *
 * Usage:
 *   1. Download your service account key from Firebase Console:
 *      Project Settings → Service Accounts → Generate New Private Key
 *      Save it as scripts/serviceAccountKey.json (DO NOT commit this file)
 *
 *   2. Find your Firebase user UID:
 *      Firebase Console → Authentication → Users → copy UID column
 *
 *   3. Run:
 *      node scripts/set-super-admin.js YOUR_UID_HERE
 *      # or with a named key file:
 *      node scripts/set-super-admin.js YOUR_UID_HERE serviceAccountKey.prod.json
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// Resolve firebase-admin from functions/ where it is installed
const fnRequire = createRequire(join(repoRoot, "functions", "package.json"));
const { initializeApp, cert } = fnRequire("firebase-admin/app");
const { getAuth } = fnRequire("firebase-admin/auth");

const uid = process.argv[2];
const keyFile = process.argv[3] ?? "serviceAccountKey.json";
if (!uid) {
  console.error("Usage: node scripts/set-super-admin.js <YOUR_UID> [keyFile.json]");
  process.exit(1);
}

// Load service account key from same directory as this script
const localRequire = createRequire(import.meta.url);
const serviceAccount = localRequire(join(__dirname, keyFile));

initializeApp({ credential: cert(serviceAccount) });

const auth = getAuth();

try {
  await auth.setCustomUserClaims(uid, { role: "super_admin" });
  await auth.revokeRefreshTokens(uid);
  console.log(`✓ Set role=super_admin on UID: ${uid}`);
  console.log("  Sign out and back in for the claim to take effect.");
  process.exit(0);
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
}

import { boot, initFeedback, shutdown } from "featurebase-js";
import { getFunctions, httpsCallable } from "firebase/functions";

/**
 * Featurebase feedback widget with verified user identity.
 * The identity JWT is signed server-side by the getFeaturebaseIdentity
 * Cloud Function. No-op when VITE_FEATUREBASE_APP_ID is unset.
 */

const APP_ID = import.meta.env.VITE_FEATUREBASE_APP_ID;

let booted = false;

export async function bootFeaturebase(user: {
  uid: string;
  email: string | null;
  displayName: string | null;
}) {
  if (!APP_ID || booted) return;
  booted = true;
  try {
    const fns = getFunctions(undefined, "us-central1");
    const res = await httpsCallable(fns, "getFeaturebaseIdentity")({
      name: user.displayName ?? undefined,
    });
    const { featurebaseJwt } = res.data as { featurebaseJwt: string };
    boot({
      appId: APP_ID,
      userId: user.uid,
      email: user.email ?? undefined,
      name: user.displayName ?? undefined,
      featurebaseJwt,
    });
    // The universal boot carries identity; the floating feedback button is
    // its own surface and needs an explicit init (identity is inherited).
    const isDark = document.documentElement.classList.contains("dark");
    initFeedback({
      theme: isDark ? "dark" : "light",
      placement: "bottom-right",
    });
  } catch (err) {
    booted = false;
    console.error("Featurebase boot failed:", err);
  }
}

export function shutdownFeaturebase() {
  if (!booted) return;
  booted = false;
  try {
    shutdown();
  } catch {
    // widget was never mounted — nothing to tear down
  }
}

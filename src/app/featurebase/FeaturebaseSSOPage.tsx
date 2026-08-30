import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useAuth } from "@/lib/contexts/auth.context";

const PORTAL_URL = "https://barterr.featurebase.app";

/**
 * SSO hop for the Featurebase feedback portal.
 *
 * Featurebase sends portal visitors here with ?return_to=<portal page>
 * (this page is also the target of the in-app "Give Feedback" menu item).
 * We fetch a signed identity JWT from getFeaturebaseIdentity and bounce
 * the user back to the portal's auth endpoint, logged in as themselves.
 */
export const FeaturebaseSSOPage = () => {
  const [searchParams] = useSearchParams();
  const { currentUser } = useAuth();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    const returnTo = searchParams.get("return_to") ?? PORTAL_URL;
    const fns = getFunctions(undefined, "us-central1");
    httpsCallable(fns, "getFeaturebaseIdentity")({
      name: currentUser.displayName ?? undefined,
    })
      .then((res) => {
        const { featurebaseJwt } = res.data as { featurebaseJwt: string };
        window.location.replace(
          `${PORTAL_URL}/api/v1/auth/access/jwt?jwt=${encodeURIComponent(featurebaseJwt)}&return_to=${encodeURIComponent(returnTo)}`
        );
      })
      .catch(() => setFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      {failed ? (
        <div className="text-center space-y-2">
          <p className="text-foreground font-medium">Couldn't open the feedback portal</p>
          <a href={PORTAL_URL} className="text-sm text-[#3366FF] underline">
            Continue without signing in
          </a>
        </div>
      ) : (
        <p className="text-muted-foreground">Taking you to the feedback portal…</p>
      )}
    </div>
  );
};

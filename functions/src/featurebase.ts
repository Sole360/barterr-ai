import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import jwt from "jsonwebtoken";

const FEATUREBASE_JWT_SECRET = defineSecret("FEATUREBASE_JWT_SECRET");

const CORS_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://barterr.ai",
  "https://dev.barterr.ai",
];

/**
 * getFeaturebaseIdentity — signs a short-lived JWT the Featurebase widget
 * uses to verify the logged-in user (Settings → Developers → Sync user
 * information). Payload per Featurebase docs: userId, email, name, HS256.
 */
export const getFeaturebaseIdentity = onCall(
  { region: "us-central1", cors: CORS_ORIGINS, invoker: "public", secrets: [FEATUREBASE_JWT_SECRET] },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Must be signed in.");

    const { name } = (req.data ?? {}) as { name?: string };

    const featurebaseJwt = jwt.sign(
      {
        userId: req.auth.uid,
        email: req.auth.token.email,
        name: name || (req.auth.token.name as string | undefined),
      },
      FEATUREBASE_JWT_SECRET.value(),
      { algorithm: "HS256", expiresIn: "1h" }
    );

    return { featurebaseJwt };
  }
);

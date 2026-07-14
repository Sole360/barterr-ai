import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getAuth } from "firebase-admin/auth";
import { logger } from "firebase-functions/v2";
import Stripe from "stripe";

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");

const CORS_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://barterr.ai",
  "https://dev.barterr.ai",
];

interface TimeSeriesPoint {
  date: string;
  grossCents: number;
  netCents: number;
}

interface TransactionRow {
  id: string;
  created: number;
  type: string;
  grossCents: number;
  feeCents: number;
  netCents: number;
  description: string;
}

export const getRevenueStats = onCall(
  {
    region: "us-central1",
    invoker: "public",
    secrets: [STRIPE_SECRET_KEY],
    cors: CORS_ORIGINS,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    const claims = (await getAuth().getUser(request.auth.uid)).customClaims ?? {};
    if (!claims.role) {
      throw new HttpsError("permission-denied", "Admins only.");
    }

    const { startDate, endDate } = request.data as { startDate: string; endDate: string };
    if (!startDate || !endDate) {
      throw new HttpsError("invalid-argument", "startDate and endDate are required (ISO format).");
    }

    const gteUnix = Math.floor(new Date(startDate).getTime() / 1000);
    // endDate is a date string like "2025-01-31" — include the full day
    const lteUnix = Math.floor(new Date(`${endDate}T23:59:59`).getTime() / 1000);

    if (isNaN(gteUnix) || isNaN(lteUnix)) {
      throw new HttpsError("invalid-argument", "Invalid date format.");
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY.value());

    // Fetch all balance transactions in range (autopaginate)
    const allTransactions: Stripe.BalanceTransaction[] = [];
    try {
      for await (const tx of stripe.balanceTransactions.list({
        created: { gte: gteUnix, lte: lteUnix },
        limit: 100,
      })) {
        allTransactions.push(tx);
      }
    } catch (err) {
      logger.error("[getRevenueStats] Stripe list error", err);
      throw new HttpsError("internal", "Failed to fetch Stripe data.");
    }

    // Separate charges from refunds
    const charges = allTransactions.filter((t) => t.type === "charge");
    const refunds = allTransactions.filter((t) => t.type === "refund");

    const grossRevenueCents = charges.reduce((s, t) => s + t.amount, 0);
    const stripeFeesCents = charges.reduce((s, t) => s + t.fee, 0);
    const netRevenueCents = charges.reduce((s, t) => s + t.net, 0);
    const refundTotalCents = Math.abs(refunds.reduce((s, t) => s + t.amount, 0));
    const orderCount = charges.length;
    const avgOrderValueCents = orderCount > 0 ? Math.round(grossRevenueCents / orderCount) : 0;

    // Build daily time series
    const dayMap = new Map<string, { grossCents: number; netCents: number }>();
    for (const tx of charges) {
      const day = new Date(tx.created * 1000).toISOString().slice(0, 10);
      const existing = dayMap.get(day) ?? { grossCents: 0, netCents: 0 };
      dayMap.set(day, {
        grossCents: existing.grossCents + tx.amount,
        netCents: existing.netCents + tx.net,
      });
    }

    const timeSeries: TimeSeriesPoint[] = Array.from(dayMap.entries())
      .map(([date, vals]) => ({ date, ...vals }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Build transaction rows (charges + refunds combined, most recent first)
    const transactions: TransactionRow[] = allTransactions
      .filter((t) => t.type === "charge" || t.type === "refund")
      .sort((a, b) => b.created - a.created)
      .map((t) => ({
        id: t.id,
        created: t.created,
        type: t.type,
        grossCents: t.amount,
        feeCents: t.fee,
        netCents: t.net,
        description: t.description ?? "",
      }));

    return {
      grossRevenueCents,
      stripeFeesCents,
      netRevenueCents,
      refundTotalCents,
      orderCount,
      avgOrderValueCents,
      timeSeries,
      transactions,
    };
  }
);

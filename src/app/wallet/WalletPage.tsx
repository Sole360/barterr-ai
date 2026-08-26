import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getFunctions, httpsCallable } from "firebase/functions";
import { collection, query, where, getDocs, orderBy, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/contexts/auth.context";
import { Navbar } from "@/components/shared/Navbar";
import { PageTransition } from "@/components/shared/PageTransition";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Wallet, ArrowDownToLine, ExternalLink, Clock, CheckCircle, AlertCircle } from "lucide-react";

interface WalletData {
  hasConnectAccount: boolean;
  connectStatus: "pending" | "active" | "restricted" | null;
  pendingPayoutCents: number;
  lifetimeEarningsCents: number;
  availableBalanceCents: number;
  pendingBalanceCents: number;
}

interface EarningsEntry {
  tradeId: string;
  amountCents: number;
  counterpartUid: string;
  completedAt: Timestamp | null;
}

function formatDollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function relativeDate(ts: Timestamp | null): string {
  if (!ts) return "—";
  const d = ts.toDate();
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatusBadge({ status }: { status: WalletData["connectStatus"] }) {
  if (!status || status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        <Clock className="w-3 h-3" /> Setup incomplete
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        <CheckCircle className="w-3 h-3" /> Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
      <AlertCircle className="w-3 h-3" /> Restricted
    </span>
  );
}

export const WalletPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const fns = getFunctions();

  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [earnings, setEarnings] = useState<EarningsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const loadWalletData = useCallback(async () => {
    if (!currentUser?.uid) return;
    try {
      const result = await httpsCallable<unknown, WalletData>(fns, "getWalletData")({});
      setWalletData(result.data);
    } catch (err) {
      console.error("getWalletData error:", err);
      toast({ title: "Could not load wallet data", variant: "destructive" });
    }
  }, [currentUser?.uid, fns, toast]);

  const loadEarningsHistory = useCallback(async () => {
    if (!currentUser?.uid) return;
    const uid = currentUser.uid;

    const [asReceiverSnap, asSenderSnap] = await Promise.all([
      // Trades where we're the receiver AND sender added cash
      getDocs(
        query(
          collection(db, "trades"),
          where("toUserId", "==", uid),
          where("status", "==", "completed"),
          orderBy("updatedAt", "desc")
        )
      ),
      // Trades where we're the sender AND receiver added cash
      getDocs(
        query(
          collection(db, "trades"),
          where("fromUserId", "==", uid),
          where("status", "==", "completed"),
          orderBy("updatedAt", "desc")
        )
      ),
    ]);

    const entries: EarningsEntry[] = [];

    asReceiverSnap.docs.forEach((doc) => {
      const data = doc.data();
      if ((data.senderCashDepositCents ?? 0) > 0) {
        entries.push({
          tradeId: doc.id,
          amountCents: data.senderCashDepositCents,
          counterpartUid: data.fromUserId,
          completedAt: data.updatedAt ?? null,
        });
      }
    });

    asSenderSnap.docs.forEach((doc) => {
      const data = doc.data();
      if ((data.receiverCashDepositCents ?? 0) > 0) {
        entries.push({
          tradeId: doc.id,
          amountCents: data.receiverCashDepositCents,
          counterpartUid: data.toUserId,
          completedAt: data.updatedAt ?? null,
        });
      }
    });

    // Sort by completedAt desc
    entries.sort((a, b) => {
      const aTime = a.completedAt?.toMillis() ?? 0;
      const bTime = b.completedAt?.toMillis() ?? 0;
      return bTime - aTime;
    });

    setEarnings(entries.slice(0, 10));
  }, [currentUser?.uid]);

  // Handle return from Stripe onboarding
  useEffect(() => {
    const onboarding = searchParams.get("onboarding");
    if (!onboarding || !currentUser?.uid) return;

    (async () => {
      try {
        await httpsCallable(fns, "syncConnectAccount")({});
        if (onboarding === "complete") {
          toast({ title: "Payouts set up!", description: "Your earnings will now transfer automatically." });
        }
      } catch {
        // Non-fatal
      }
      setSearchParams({}, { replace: true });
      await loadWalletData();
    })();
  }, [searchParams, currentUser?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoading(true);
    Promise.all([loadWalletData(), loadEarningsHistory()]).finally(() => setLoading(false));
  }, [loadWalletData, loadEarningsHistory]);

  const handleSetupPayouts = async () => {
    setActionLoading(true);
    try {
      // Create account if needed
      await httpsCallable(fns, "createConnectAccount")({});

      // Get onboarding URL
      const origin = window.location.origin;
      const linkResult = await httpsCallable<unknown, { url: string }>(fns, "getConnectOnboardingLink")({
        returnUrl: `${origin}/wallet?onboarding=complete`,
        refreshUrl: `${origin}/wallet?onboarding=refresh`,
      });

      window.location.href = linkResult.data.url;
    } catch (err) {
      console.error("Setup payouts error:", err);
      toast({ title: "Could not start payout setup", variant: "destructive" });
      setActionLoading(false);
    }
  };

  const handleContinueSetup = async () => {
    setActionLoading(true);
    try {
      const origin = window.location.origin;
      const linkResult = await httpsCallable<unknown, { url: string }>(fns, "getConnectOnboardingLink")({
        returnUrl: `${origin}/wallet?onboarding=complete`,
        refreshUrl: `${origin}/wallet?onboarding=refresh`,
      });
      window.location.href = linkResult.data.url;
    } catch (err) {
      console.error("Continue setup error:", err);
      toast({ title: "Could not open payout setup", variant: "destructive" });
      setActionLoading(false);
    }
  };

  const handleWithdraw = async () => {
    setActionLoading(true);
    try {
      const result = await httpsCallable<unknown, { success: boolean; amountCents: number }>(fns, "withdrawEarnings")({});
      if (result.data.success) {
        toast({
          title: "Withdrawal initiated",
          description: `${formatDollars(result.data.amountCents)} is on its way to your bank (2–3 business days).`,
        });
        await loadWalletData();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Withdrawal failed";
      toast({ title: "Withdrawal failed", description: message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleViewStripeDashboard = async () => {
    setActionLoading(true);
    try {
      const result = await httpsCallable<unknown, { url: string }>(fns, "getConnectDashboardLink")({});
      window.open(result.data.url, "_blank", "noopener");
    } catch (err) {
      console.error("Dashboard link error:", err);
      toast({ title: "Could not open dashboard", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const totalBalance = walletData
    ? walletData.availableBalanceCents + walletData.pendingBalanceCents + walletData.pendingPayoutCents
    : 0;

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-16 pb-24">
          <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
            {/* Header */}
            <div>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-[#3366FF]" />
                <h1 className="text-2xl font-bold text-foreground">Wallet</h1>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Cash earned from trades
              </p>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : (
              <>
                {/* Balance card */}
                <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                  {/* Gradient header */}
                  <div className="bg-gradient-to-r from-[#3366FF] to-[#6644FF] px-6 py-5">
                    <p className="text-xs text-white/70 font-medium uppercase tracking-wide">Total balance</p>
                    <p className="text-4xl font-bold text-white mt-1">
                      {formatDollars(totalBalance)}
                    </p>
                    {walletData?.lifetimeEarningsCents ? (
                      <p className="text-xs text-white/60 mt-1">
                        {formatDollars(walletData.lifetimeEarningsCents)} lifetime earnings
                      </p>
                    ) : null}
                  </div>

                  <div className="px-6 py-5 space-y-4">
                    {/* Status + breakdown */}
                    {walletData?.hasConnectAccount && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-medium">Payout account</span>
                        <StatusBadge status={walletData.connectStatus} />
                      </div>
                    )}

                    {/* Balance breakdown rows */}
                    {walletData?.hasConnectAccount && walletData.connectStatus === "active" && (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Available to withdraw</span>
                          <span className="font-semibold text-foreground">
                            {formatDollars(walletData.availableBalanceCents)}
                          </span>
                        </div>
                        {walletData.pendingBalanceCents > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Processing</span>
                            <span className="text-muted-foreground">
                              {formatDollars(walletData.pendingBalanceCents)}
                            </span>
                          </div>
                        )}
                        {walletData.pendingPayoutCents > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Queued (pre-setup)</span>
                            <span className="text-muted-foreground">
                              {formatDollars(walletData.pendingPayoutCents)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* No Connect account — show pending balance from Firestore */}
                    {!walletData?.hasConnectAccount && (walletData?.pendingPayoutCents ?? 0) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Pending (set up payouts to claim)</span>
                        <span className="font-semibold text-foreground">
                          {formatDollars(walletData!.pendingPayoutCents)}
                        </span>
                      </div>
                    )}

                    {/* CTA buttons */}
                    <div className="space-y-2 pt-1">
                      {/* No account → set up */}
                      {!walletData?.hasConnectAccount && (
                        <Button
                          className="w-full bg-[#3366FF] hover:bg-[#3366FF]/90"
                          disabled={actionLoading}
                          onClick={handleSetupPayouts}
                        >
                          {actionLoading ? "Opening Stripe…" : "Set up payouts"}
                        </Button>
                      )}

                      {/* Account pending → continue onboarding */}
                      {walletData?.hasConnectAccount && walletData.connectStatus !== "active" && (
                        <Button
                          className="w-full bg-[#3366FF] hover:bg-[#3366FF]/90"
                          disabled={actionLoading}
                          onClick={handleContinueSetup}
                        >
                          {actionLoading ? "Opening Stripe…" : "Continue payout setup"}
                        </Button>
                      )}

                      {/* Active account → withdraw */}
                      {walletData?.connectStatus === "active" && (
                        <>
                          <Button
                            className="w-full bg-[#3366FF] hover:bg-[#3366FF]/90 gap-1.5"
                            disabled={actionLoading || (walletData.availableBalanceCents <= 0)}
                            onClick={handleWithdraw}
                          >
                            <ArrowDownToLine className="w-4 h-4" />
                            {actionLoading
                              ? "Processing…"
                              : walletData.availableBalanceCents > 0
                              ? `Withdraw ${formatDollars(walletData.availableBalanceCents)}`
                              : "No balance to withdraw"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full gap-1.5"
                            disabled={actionLoading}
                            onClick={handleViewStripeDashboard}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            View Stripe dashboard
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* What are payouts? (only when no account) */}
                {!walletData?.hasConnectAccount && (
                  <div className="rounded-2xl border border-border bg-card px-6 py-5">
                    <h3 className="text-sm font-semibold text-foreground mb-2">How payouts work</h3>
                    <ul className="space-y-2 text-xs text-muted-foreground">
                      <li className="flex gap-2">
                        <span className="shrink-0 w-4 h-4 rounded-full bg-[#3366FF]/10 text-[#3366FF] flex items-center justify-center text-[10px] font-bold">1</span>
                        When a trade includes cash, Barterr holds it for you
                      </li>
                      <li className="flex gap-2">
                        <span className="shrink-0 w-4 h-4 rounded-full bg-[#3366FF]/10 text-[#3366FF] flex items-center justify-center text-[10px] font-bold">2</span>
                        Connect a bank account via Stripe to receive your cash
                      </li>
                      <li className="flex gap-2">
                        <span className="shrink-0 w-4 h-4 rounded-full bg-[#3366FF]/10 text-[#3366FF] flex items-center justify-center text-[10px] font-bold">3</span>
                        Withdraw anytime — funds arrive in 2–3 business days
                      </li>
                    </ul>
                  </div>
                )}

                {/* Earnings history */}
                {earnings.length > 0 && (
                  <div className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="px-6 py-4 border-b border-border">
                      <h3 className="text-sm font-semibold text-foreground">Earnings history</h3>
                    </div>
                    <div className="divide-y divide-border">
                      {earnings.map((entry) => (
                        <button
                          key={entry.tradeId}
                          type="button"
                          onClick={() => navigate(`/trades/${entry.tradeId}`)}
                          className="w-full flex items-center justify-between px-6 py-3.5 hover:bg-accent/40 transition-colors text-left"
                        >
                          <div>
                            <p className="text-sm font-medium text-foreground">Cash from trade</p>
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">
                              {entry.tradeId.slice(0, 12)}…
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                              +{formatDollars(entry.amountCents)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {relativeDate(entry.completedAt)}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty earnings state */}
                {earnings.length === 0 && !loading && (
                  <div className="rounded-2xl border border-border bg-card p-8 text-center">
                    <Wallet className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm font-medium text-foreground">No earnings yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Cash from completed trades will appear here
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { ArrowLeft, ArrowLeftRight, Mail } from "lucide-react";

import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/contexts/auth.context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Navbar } from "@/components/shared/Navbar";
import { PageTransition } from "@/components/shared/PageTransition";
import {
  serviceFeeCentsForCount,
  grossUpForStripe,
  formatUsd,
  toCents,
} from "@/lib/pricing/tradePricing";

import type {
  TradeDocument,
  TradeDocumentYourItem,
  TradeDocumentTheirItem,
} from "@/types";
import { ShippingSection } from "./ShippingSection";

type BillingDoc = {
  defaultPaymentMethodId?: string;
  defaultPaymentMethodBrand?: string;
  defaultPaymentMethodLast4?: string;
};

type OtherUser = { displayName: string; photoURL?: string };

// ─── Sneaker thumbnail ────────────────────────────────────────────────────────

function SneakerThumb({
  item,
}: {
  item: TradeDocumentYourItem | TradeDocumentTheirItem;
}) {
  const name = "name" in item ? item.name : item.title;
  return (
    <div className="shrink-0 w-28 rounded-2xl bg-background border border-border overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <div className="relative aspect-square bg-gray-50 dark:bg-muted/60">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={name}
            className="absolute inset-0 w-full h-full object-contain p-2"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 bg-muted/40" />
        )}
      </div>
      <div className="p-2">
        <div className="text-[11px] font-semibold text-foreground line-clamp-2 leading-snug">
          {name}
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">Size {item.size}</div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export const TradeDetailPage = () => {
  const navigate = useNavigate();
  const { tradeId } = useParams();
  const { currentUser } = useAuth();
  const { toast } = useToast();

  const [trade, setTrade] = useState<TradeDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);

  const [billingLoading, setBillingLoading] = useState(true);
  const [hasPaymentMethod, setHasPaymentMethod] = useState(false);
  const [cardSummary, setCardSummary] = useState<{ brand: string; last4: string } | null>(null);

  // Load trade document
  useEffect(() => {
    if (!tradeId) return;
    setLoading(true);
    const unsub = onSnapshot(
      doc(db, "trades", tradeId),
      (snap) => {
        setTrade(snap.exists() ? (snap.data() as TradeDocument) : null);
        setLoading(false);
      },
      (err) => {
        console.error("TradeDetail snapshot error:", err);
        setTrade(null);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tradeId]);

  // Fetch other user profile once trade is known
  useEffect(() => {
    if (!trade || !currentUser?.uid) return;
    const otherId =
      trade.fromUserId === currentUser.uid ? trade.toUserId : trade.fromUserId;
    if (!otherId) return;

    getDoc(doc(db, "users", otherId)).then((snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setOtherUser({ displayName: d.displayName ?? "Trade Partner", photoURL: d.photoURL });
      }
    });
  }, [trade?.fromUserId, trade?.toUserId, currentUser?.uid]);

  // Load billing for receiver
  useEffect(() => {
    if (!currentUser?.uid) {
      setBillingLoading(false);
      return;
    }
    const load = async () => {
      setBillingLoading(true);
      try {
        const snap = await getDoc(doc(db, `users/${currentUser.uid}/private/billing`));
        const billing = snap.data() as BillingDoc | undefined;
        if (billing?.defaultPaymentMethodId) {
          setHasPaymentMethod(true);
          if (billing.defaultPaymentMethodBrand && billing.defaultPaymentMethodLast4) {
            setCardSummary({ brand: billing.defaultPaymentMethodBrand, last4: billing.defaultPaymentMethodLast4 });
          }
        } else {
          setHasPaymentMethod(false);
          setCardSummary(null);
        }
      } catch {
        setHasPaymentMethod(false);
      } finally {
        setBillingLoading(false);
      }
    };
    load();
  }, [currentUser?.uid]);

  const isSender = useMemo(
    () => !!currentUser?.uid && !!trade && trade.fromUserId === currentUser.uid,
    [currentUser?.uid, trade]
  );
  const isReceiver = useMemo(
    () => !!currentUser?.uid && !!trade && trade.toUserId === currentUser.uid,
    [currentUser?.uid, trade]
  );

  const receiverFees = useMemo(() => {
    if (!trade) return null;
    const sneakerCount = trade.theirItems?.length || 0;
    const cashDeposit = trade.askCash || 0;
    const serviceFeeCents = serviceFeeCentsForCount(sneakerCount);
    const cashDepositCents = toCents(cashDeposit);
    const netCents = cashDepositCents + serviceFeeCents;
    const { grossCents, feeCents } = grossUpForStripe(netCents);
    return { sneakerCount, serviceFeeCents, cashDepositCents, processingFeeCents: feeCents, totalCents: grossCents };
  }, [trade]);

  const statusText = useMemo(() => {
    if (!trade) return "";
    switch (trade.status) {
      case "declined": return "Declined";
      case "completed": return "Completed";
      case "failed": return "Payment Failed";
      case "processing": return "Processing Payments";
      case "both_confirmed": return "Confirmed — Processing";
      case "pending":
      default:
        if (isReceiver) return trade.receiverConfirmed ? "You accepted" : "Action needed";
        return trade.receiverConfirmed ? "Accepted" : "Pending";
    }
  }, [trade, isReceiver]);

  const myPaymentFailed = useMemo(() => {
    if (!trade || trade.status !== "failed") return false;
    if (isSender) return trade.senderPaymentStatus === "failed";
    if (isReceiver) return trade.receiverPaymentStatus === "failed";
    return false;
  }, [trade, isSender, isReceiver]);

  const myPaymentError = useMemo(() => {
    if (!trade) return null;
    if (isSender) return trade.senderPaymentError;
    if (isReceiver) return trade.receiverPaymentError;
    return null;
  }, [trade, isSender, isReceiver]);

  const handleAccept = async () => {
    if (!tradeId || !trade || !isReceiver) return;
    if (!hasPaymentMethod) {
      toast({ title: "Payment method required", description: "Please add a payment method before accepting.", variant: "destructive" });
      return;
    }
    setActing(true);
    try {
      const fns = getFunctions(undefined, "us-central1");
      await httpsCallable(fns, "acceptTrade")({ tradeId });
      toast({ title: "Trade accepted!", description: "Processing payments…" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to accept trade";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const handleDecline = async () => {
    if (!tradeId || !trade || !isReceiver) return;
    setActing(true);
    try {
      await updateDoc(doc(db, "trades", tradeId), { status: "declined" });
      toast({ title: "Trade declined" });
      navigate("/trades");
    } catch {
      toast({ title: "Error", description: "Failed to decline trade", variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const handleRetryPayment = async () => {
    if (!tradeId || !trade) return;
    setActing(true);
    try {
      const fns = getFunctions(undefined, "us-central1");
      const result = await httpsCallable(fns, "retryPayment")({ tradeId });
      const data = result.data as { success: boolean; status?: string; error?: string };
      if (data.success) {
        toast({ title: data.status === "completed" ? "Payment successful!" : "Payment authorized", description: data.status === "completed" ? "Trade completed." : "Waiting for the other party to fix their payment." });
      } else {
        toast({ title: "Payment failed", description: data.error || "Please try again.", variant: "destructive" });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to retry payment";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const showDMComingSoon = () =>
    toast({ title: "Coming soon", description: "Direct messaging is on the way!" });

  const otherId = trade
    ? trade.fromUserId === currentUser?.uid
      ? trade.toUserId
      : trade.fromUserId
    : null;

  const receiverNeedsAction =
    isReceiver && trade?.status === "pending" && !trade?.receiverConfirmed;

  // ─── Loading / guard states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-20 px-4 mx-auto max-w-2xl">
          <div className="text-sm text-muted-foreground">Loading trade…</div>
        </div>
      </div>
    );
  }

  if (!trade) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-20 px-4 mx-auto max-w-2xl">
          <button onClick={() => navigate("/trades")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="text-sm text-muted-foreground">Trade not found.</div>
        </div>
      </div>
    );
  }

  if (!isSender && !isReceiver) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-20 px-4 mx-auto max-w-2xl">
          <button onClick={() => navigate("/trades")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="text-sm text-muted-foreground">You don't have access to this trade.</div>
        </div>
      </div>
    );
  }

  const yourItems = trade.yourItems ?? [];
  const theirItems = trade.theirItems ?? [];
  const otherName = otherUser?.displayName ?? "Trade Partner";
  const otherInitials = otherName.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("");

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <PageTransition>
        <main className={`pt-20 px-4 mx-auto max-w-2xl ${receiverNeedsAction ? "pb-32" : "pb-10"}`}>
          {/* Back */}
          <button
            onClick={() => navigate("/trades")}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5"
          >
            <ArrowLeft className="w-4 h-4" />
            Trades
          </button>

          {/* Trade partner card */}
          <div className="flex items-center gap-3 rounded-2xl bg-card border border-border p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] mb-5">
            <button
              type="button"
              onClick={() => otherId && navigate(`/profile/${otherId}`)}
              className="shrink-0"
            >
              <Avatar className="h-12 w-12 ring-2 ring-border">
                <AvatarImage src={otherUser?.photoURL} alt={otherName} className="object-cover" />
                <AvatarFallback className="font-semibold bg-gradient-to-br from-[#33FF99]/60 to-[#3366FF]/60 text-foreground">
                  {otherInitials || "?"}
                </AvatarFallback>
              </Avatar>
            </button>

            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => otherId && navigate(`/profile/${otherId}`)}
                className="text-sm font-semibold text-foreground hover:text-[#3366FF] transition-colors"
              >
                {otherName}
              </button>
              <div className="text-xs text-muted-foreground mt-0.5">
                {isSender ? "You sent this offer" : "Sent you a trade offer"}
              </div>
            </div>

            <button
              type="button"
              onClick={showDMComingSoon}
              className="shrink-0 p-2 rounded-full hover:bg-accent transition-colors text-muted-foreground"
              title="Message"
            >
              <Mail className="w-4 h-4" />
            </button>

            <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
              {statusText}
            </span>
          </div>

          {/* Status banners */}
          {trade.status === "completed" && (
            <div className="mb-5 rounded-2xl border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
              <div className="text-sm font-semibold text-green-800 dark:text-green-300">
                Payments captured — time to ship!
              </div>
              <div className="mt-1 text-xs text-green-700 dark:text-green-400">
                Both parties have been charged. Get your shipping label below and send your sneakers to Barterr for authentication.
              </div>
            </div>
          )}

          {trade.status === "processing" && (
            <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
              <div className="text-sm font-semibold text-blue-800 dark:text-blue-300">Processing Payments</div>
              <div className="mt-1 text-xs text-blue-700 dark:text-blue-400">
                We're charging both parties. This may take a moment.
              </div>
            </div>
          )}

          {trade.status === "failed" && (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
              <div className="text-sm font-semibold text-red-800 dark:text-red-300">Payment Failed</div>
              {myPaymentFailed ? (
                <>
                  <div className="mt-1 text-xs text-red-700 dark:text-red-400">
                    {myPaymentError || "Your card was declined."}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate("/trades/new/review/payment-method", { state: { returnTo: `/trades/${tradeId}` } })}
                    >
                      Update Card
                    </Button>
                    <Button
                      size="sm"
                      className="bg-red-600 hover:bg-red-700"
                      onClick={handleRetryPayment}
                      disabled={acting}
                    >
                      {acting ? "Retrying…" : "Retry Payment"}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="mt-1 text-xs text-red-700 dark:text-red-400">
                  The other party's payment failed. Waiting for them to update their payment method.
                </div>
              )}
            </div>
          )}

          <div className="space-y-6">
            {/* Side-by-side trade panel */}
            <div className="rounded-2xl bg-card border border-border p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <div className="flex items-start gap-2">
                {/* Your side */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {isSender ? "You" : "Them"}
                    </span>
                    {trade.addCash > 0 && (
                      <span className="text-[11px] font-semibold text-green-600">+${trade.addCash}</span>
                    )}
                  </div>
                  {yourItems.length > 0 ? (
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                      {yourItems.map((item, idx) => (
                        <SneakerThumb key={item.listingId || idx} item={item} />
                      ))}
                    </div>
                  ) : (
                    <div className="h-20 rounded-xl border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground">
                      None
                    </div>
                  )}
                </div>

                {/* Trade icon */}
                <div className="shrink-0 flex flex-col items-center pt-5">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </div>

                {/* Their side */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {isReceiver ? "You" : "Them"}
                    </span>
                    {trade.askCash > 0 && (
                      <span className="text-[11px] font-semibold text-green-600">+${trade.askCash}</span>
                    )}
                  </div>
                  {theirItems.length > 0 ? (
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                      {theirItems.map((item, idx) => (
                        <SneakerThumb key={item.listingId || idx} item={item} />
                      ))}
                    </div>
                  ) : (
                    <div className="h-20 rounded-xl border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground">
                      None
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Receiver: fee breakdown (inline, buttons are in sticky footer) */}
            {receiverNeedsAction && receiverFees && (
              <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                <div className="text-sm font-semibold text-foreground mb-4">Your Fees to Accept</div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="text-muted-foreground">Cash deposit</div>
                    <div className="font-semibold">{formatUsd(receiverFees.cashDepositCents)}</div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="text-muted-foreground">
                      Service fee ({receiverFees.sneakerCount} sneaker{receiverFees.sneakerCount === 1 ? "" : "s"})
                    </div>
                    <div className="font-semibold">{formatUsd(receiverFees.serviceFeeCents)}</div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="text-muted-foreground">Processing fee</div>
                    <div className="font-semibold">{formatUsd(receiverFees.processingFeeCents)}</div>
                  </div>
                  <div className="border-t border-border pt-2.5 flex items-center justify-between">
                    <div className="text-sm font-semibold">Total</div>
                    <div className="text-base font-bold">{formatUsd(receiverFees.totalCents)}</div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border pt-3.5">
                  <div className="text-sm text-muted-foreground">Payment Method</div>
                  {billingLoading ? (
                    <div className="text-sm text-muted-foreground">Loading…</div>
                  ) : hasPaymentMethod ? (
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold">
                        {cardSummary ? `${cardSummary.brand.toUpperCase()} •••• ${cardSummary.last4}` : "Card on file"}
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate("/trades/new/review/payment-method", { state: { returnTo: `/trades/${tradeId}` } })}
                        className="text-sm font-semibold text-[#3366FF]"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate("/trades/new/review/payment-method", { state: { returnTo: `/trades/${tradeId}` } })}
                      className="text-sm font-semibold text-[#3366FF]"
                    >
                      Add
                    </button>
                  )}
                </div>

                <div className="mt-3 text-xs text-muted-foreground">
                  Accepting is binding. You will be charged immediately.
                </div>
              </section>
            )}

            {/* Sender: waiting */}
            {isSender && trade.status === "pending" && !trade.receiverConfirmed && (
              <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
                <div className="text-sm font-medium text-foreground">Waiting for response</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  The other user hasn't responded yet. You'll be notified when they do.
                </div>
              </div>
            )}

            {/* Trade accepted, processing */}
            {trade.status === "pending" && trade.receiverConfirmed && (
              <div className="rounded-2xl border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
                <div className="text-sm font-medium text-green-800 dark:text-green-300">Trade Accepted</div>
                <div className="mt-1 text-xs text-green-700 dark:text-green-400">
                  {isReceiver
                    ? "You've accepted this trade. Payment is being processed."
                    : "The other user has accepted. Payment is being processed."}
                </div>
              </div>
            )}

            {/* Shipping */}
            {trade.status === "completed" && tradeId && (
              <ShippingSection tradeId={tradeId} isSender={isSender} />
            )}
          </div>
        </main>

        {/* Sticky Accept / Decline footer */}
        {receiverNeedsAction && (
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-t border-border px-4 py-4">
            <div className="mx-auto max-w-2xl flex gap-3">
              <Button
                className="flex-1 bg-[#3366FF] hover:bg-[#3366FF]/90"
                onClick={handleAccept}
                disabled={acting || !hasPaymentMethod || billingLoading}
              >
                {acting ? "Processing…" : !hasPaymentMethod ? "Add payment method" : "Accept Trade"}
              </Button>
              <Button
                className="flex-1"
                variant="outline"
                onClick={handleDecline}
                disabled={acting}
              >
                Decline
              </Button>
            </div>
          </div>
        )}
      </PageTransition>
    </div>
  );
};

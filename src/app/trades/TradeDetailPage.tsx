import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/contexts/auth.context";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
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

type BillingDoc = {
  defaultPaymentMethodId?: string;
  defaultPaymentMethodBrand?: string;
  defaultPaymentMethodLast4?: string;
};

function SneakerRow({
  item,
}: {
  item: TradeDocumentYourItem | TradeDocumentTheirItem;
}) {
  const name = "name" in item ? item.name : item.title;
  const imageUrl = item.imageUrl;
  const size = item.size;

  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={name}
          className="h-12 w-12 rounded object-contain"
          loading="lazy"
        />
      ) : (
        <div className="h-12 w-12 rounded bg-gray-100" />
      )}
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">Size {size}</div>
      </div>
    </div>
  );
}

export const TradeDetailPage = () => {
  const navigate = useNavigate();
  const { tradeId } = useParams();
  const { currentUser } = useAuth();
  const { toast } = useToast();

  const [trade, setTrade] = useState<TradeDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  // Billing state for receiver
  const [billingLoading, setBillingLoading] = useState(true);
  const [hasPaymentMethod, setHasPaymentMethod] = useState(false);
  const [cardSummary, setCardSummary] = useState<{
    brand: string;
    last4: string;
  } | null>(null);

  // Load trade document
  useEffect(() => {
    if (!tradeId) return;

    setLoading(true);
    const ref = doc(db, "trades", tradeId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setTrade(null);
          setLoading(false);
          return;
        }
        setTrade(snap.data() as TradeDocument);
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

  // Load billing for receiver
  useEffect(() => {
    if (!currentUser?.uid) {
      setBillingLoading(false);
      return;
    }

    const loadBilling = async () => {
      setBillingLoading(true);
      try {
        const billingSnap = await getDoc(
          doc(db, `users/${currentUser.uid}/private/billing`)
        );
        const billing = billingSnap.data() as BillingDoc | undefined;

        if (billing?.defaultPaymentMethodId) {
          setHasPaymentMethod(true);
          if (billing.defaultPaymentMethodBrand && billing.defaultPaymentMethodLast4) {
            setCardSummary({
              brand: billing.defaultPaymentMethodBrand,
              last4: billing.defaultPaymentMethodLast4,
            });
          }
        } else {
          setHasPaymentMethod(false);
          setCardSummary(null);
        }
      } catch (e) {
        console.error("Failed to load billing:", e);
        setHasPaymentMethod(false);
      } finally {
        setBillingLoading(false);
      }
    };

    loadBilling();
  }, [currentUser?.uid]);

  const isSender = useMemo(() => {
    if (!currentUser?.uid || !trade) return false;
    return trade.fromUserId === currentUser.uid;
  }, [currentUser?.uid, trade]);

  const isReceiver = useMemo(() => {
    if (!currentUser?.uid || !trade) return false;
    return trade.toUserId === currentUser.uid;
  }, [currentUser?.uid, trade]);

  // Calculate receiver's fees (preview before accept)
  const receiverFees = useMemo(() => {
    if (!trade) return null;

    const receiverSneakerCount = trade.theirItems?.length || 0;
    const receiverCashDeposit = trade.askCash || 0;

    const serviceFeeCents = serviceFeeCentsForCount(receiverSneakerCount);
    const cashDepositCents = toCents(receiverCashDeposit);
    const netCents = cashDepositCents + serviceFeeCents;
    const { grossCents, feeCents } = grossUpForStripe(netCents);

    return {
      sneakerCount: receiverSneakerCount,
      serviceFeeCents,
      cashDepositCents,
      processingFeeCents: feeCents,
      totalCents: grossCents,
    };
  }, [trade]);

  const statusText = useMemo(() => {
    if (!trade) return "";

    switch (trade.status) {
      case "declined":
        return "Declined";
      case "completed":
        return "Completed";
      case "failed":
        return "Payment Failed";
      case "processing":
        return "Processing Payments";
      case "both_confirmed":
        return "Confirmed - Processing";
      case "pending":
      default:
        if (isReceiver) {
          return trade.receiverConfirmed ? "You accepted" : "Action needed";
        }
        return trade.receiverConfirmed ? "Accepted" : "Pending";
    }
  }, [trade, isReceiver]);

  const handleAccept = async () => {
    if (!tradeId || !trade || !isReceiver) return;

    if (!hasPaymentMethod) {
      toast({
        title: "Payment method required",
        description: "Please add a payment method before accepting.",
        variant: "destructive",
      });
      return;
    }

    setActing(true);
    try {
      const functions = getFunctions(undefined, "us-central1");
      const acceptTradeFn = httpsCallable(functions, "acceptTrade");
      await acceptTradeFn({ tradeId });

      toast({
        title: "Trade accepted!",
        description: "Processing payments...",
      });
    } catch (err: unknown) {
      console.error("Accept trade error:", err);
      const message =
        err instanceof Error ? err.message : "Failed to accept trade";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setActing(false);
    }
  };

  const handleDecline = async () => {
    if (!tradeId || !trade || !isReceiver) return;

    setActing(true);
    try {
      await updateDoc(doc(db, "trades", tradeId), {
        status: "declined",
      });

      toast({ title: "Trade declined" });
      navigate("/trades");
    } catch (err) {
      console.error("Decline trade error:", err);
      toast({
        title: "Error",
        description: "Failed to decline trade",
        variant: "destructive",
      });
    } finally {
      setActing(false);
    }
  };

  const handleRetryPayment = async () => {
    if (!tradeId || !trade) return;

    setActing(true);
    try {
      const functions = getFunctions(undefined, "us-central1");
      const retryPaymentFn = httpsCallable(functions, "retryPayment");
      const result = await retryPaymentFn({ tradeId });
      const data = result.data as {
        success: boolean;
        status?: string;
        error?: string;
      };

      if (data.success) {
        if (data.status === "completed") {
          toast({
            title: "Payment successful!",
            description: "Trade completed.",
          });
        } else {
          toast({
            title: "Payment authorized",
            description: "Waiting for the other party to fix their payment.",
          });
        }
      } else {
        toast({
          title: "Payment failed",
          description: data.error || "Please try again.",
          variant: "destructive",
        });
      }
    } catch (err: unknown) {
      console.error("Retry payment error:", err);
      const message =
        err instanceof Error ? err.message : "Failed to retry payment";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setActing(false);
    }
  };

  // Check if my payment failed
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

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:max-w-4xl xl:max-w-5xl">
          <div className="text-sm text-muted-foreground">Loading trade…</div>
        </div>
      </div>
    );
  }

  if (!trade) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:max-w-4xl xl:max-w-5xl">
          <Button variant="ghost" onClick={() => navigate("/trades")}>
            Back
          </Button>
          <div className="mt-4 text-sm text-muted-foreground">
            Trade not found.
          </div>
        </div>
      </div>
    );
  }

  if (!isSender && !isReceiver) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:max-w-4xl xl:max-w-5xl">
          <Button variant="ghost" onClick={() => navigate("/trades")}>
            Back
          </Button>
          <div className="mt-4 text-sm text-muted-foreground">
            You don't have access to this trade.
          </div>
        </div>
      </div>
    );
  }

  const yourItems = trade.yourItems ?? [];
  const theirItems = trade.theirItems ?? [];

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:max-w-4xl xl:max-w-5xl">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => navigate("/trades")}>
            Back
          </Button>

          <div className="min-w-0 text-right">
            <div className="truncate text-sm font-semibold">
              Trade #{tradeId?.slice(-6)}
            </div>
            <div className="text-xs text-muted-foreground">{statusText}</div>
          </div>
        </div>

        {/* Status Banner */}
        {trade.status === "completed" && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <div className="font-semibold">Trade Complete!</div>
            <div className="mt-1 text-xs">
              Both parties have been charged. You'll receive shipping
              instructions soon.
            </div>
          </div>
        )}

        {trade.status === "processing" && (
          <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <div className="font-semibold">Processing Payments</div>
            <div className="mt-1 text-xs">
              We're charging both parties. This may take a moment.
            </div>
          </div>
        )}

        {trade.status === "failed" && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4">
            <div className="text-sm font-semibold text-red-800">
              Payment Failed
            </div>
            {myPaymentFailed ? (
              <>
                <div className="mt-1 text-xs text-red-700">
                  {myPaymentError || "Your card was declined."}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      navigate("/trades/new/review/payment-method", {
                        state: { returnTo: `/trades/${tradeId}` },
                      })
                    }
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
              <div className="mt-1 text-xs text-red-700">
                The other party's payment failed. Waiting for them to update
                their payment method.
              </div>
            )}
          </div>
        )}

        <div className="mt-6 space-y-6">
          {/* Sender's Offer (what they're giving) */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {isSender ? "You're Offering" : "They're Offering"}
              </h2>
              {trade.addCash > 0 && (
                <div className="text-sm text-green-600">
                  +${trade.addCash} cash
                </div>
              )}
            </div>

            {yourItems.length ? (
              <div className="space-y-2">
                {yourItems.map((item, idx) => (
                  <SneakerRow key={item.listingId || idx} item={item} />
                ))}
              </div>
            ) : (
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                No sneakers included.
              </div>
            )}
          </section>

          {/* Receiver's Items (what they're giving) */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {isReceiver ? "You're Giving" : "They're Giving"}
              </h2>
              {trade.askCash > 0 && (
                <div className="text-sm text-green-600">
                  +${trade.askCash} cash
                </div>
              )}
            </div>

            {theirItems.length ? (
              <div className="space-y-2">
                {theirItems.map((item, idx) => (
                  <SneakerRow key={item.listingId || idx} item={item} />
                ))}
              </div>
            ) : (
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                No sneakers included.
              </div>
            )}
          </section>

          {/* Receiver Pricing & Accept Section */}
          {isReceiver &&
            trade.status === "pending" &&
            !trade.receiverConfirmed && (
              <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold">Your Fees to Accept</div>

                {receiverFees && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="text-muted-foreground">Cash deposit</div>
                      <div className="font-semibold">
                        {formatUsd(receiverFees.cashDepositCents)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <div className="text-muted-foreground">
                        Service fee ({receiverFees.sneakerCount} sneaker
                        {receiverFees.sneakerCount === 1 ? "" : "s"})
                      </div>
                      <div className="font-semibold">
                        {formatUsd(receiverFees.serviceFeeCents)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <div className="text-muted-foreground">Processing fee</div>
                      <div className="font-semibold">
                        {formatUsd(receiverFees.processingFeeCents)}
                      </div>
                    </div>

                    <div className="border-t border-gray-100 pt-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">Total</div>
                        <div className="text-base font-bold">
                          {formatUsd(receiverFees.totalCents)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Payment Method */}
                <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                  <div className="text-sm text-muted-foreground">
                    Payment Method
                  </div>
                  {billingLoading ? (
                    <div className="text-sm text-muted-foreground">
                      Loading…
                    </div>
                  ) : hasPaymentMethod ? (
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold">
                        {cardSummary
                          ? `${cardSummary.brand.toUpperCase()} •••• ${cardSummary.last4}`
                          : "Card on file"}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          navigate("/trades/new/review/payment-method", {
                            state: { returnTo: `/trades/${tradeId}` },
                          })
                        }
                        className="text-sm font-semibold text-[#3366FF]"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        navigate("/trades/new/review/payment-method", {
                          state: { returnTo: `/trades/${tradeId}` },
                        })
                      }
                      className="text-sm font-semibold text-[#3366FF]"
                    >
                      Add
                    </button>
                  )}
                </div>

                <div className="mt-4 text-xs text-muted-foreground">
                  Accepting is binding. You will be charged immediately.
                </div>

                <div className="mt-4 flex gap-3">
                  <Button
                    className="flex-1 bg-[#3366FF] hover:bg-[#3366FF]/90"
                    onClick={handleAccept}
                    disabled={acting || !hasPaymentMethod || billingLoading}
                  >
                    {acting
                      ? "Processing…"
                      : !hasPaymentMethod
                        ? "Add payment method"
                        : "Accept Trade"}
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
              </section>
            )}

          {/* Sender waiting view */}
          {isSender && trade.status === "pending" && !trade.receiverConfirmed && (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              <div className="font-medium text-foreground">Waiting for response</div>
              <div className="mt-1 text-xs">
                The other user hasn't responded yet. You'll be notified when they
                do.
              </div>
            </div>
          )}

          {/* Already accepted by receiver, waiting for processing */}
          {trade.status === "pending" && trade.receiverConfirmed && (
            <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm">
              <div className="font-medium text-green-800">Trade Accepted</div>
              <div className="mt-1 text-xs text-green-700">
                {isReceiver
                  ? "You've accepted this trade. Payment is being processed."
                  : "The other user has accepted. Payment is being processed."}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

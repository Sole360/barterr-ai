import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import useEmblaCarousel from "embla-carousel-react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/contexts/auth.context";
import { Button } from "@/components/ui/button";
import type { TradeReviewDraft } from "@/types/index";
import { useToast } from "@/hooks/use-toast";
import { stripePromise } from "@/lib/stripe/stripeClient";

const STRIPE_FEE_PCT = 0.029;
const STRIPE_FEE_FIXED_CENTS = 30;

const toCents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => c / 100;
const formatUsd = (cents: number) => `$${fromCents(cents).toFixed(2)}`;

/**
 * Service fee scales with sneaker count up to 5.
 * 1->$40, 2->$50, 3->$60, 4->$70, 5+->$80
 */
const serviceFeeDollarsForCount = (count: number) => {
  if (count <= 1) return 40;
  if (count === 2) return 50;
  if (count === 3) return 60;
  if (count === 4) return 70;
  return 80;
};

/**
 * Gross-up so the user covers Stripe processing fee.
 * Returns { grossCents, feeCents }.
 */
const grossUpForStripe = (netCents: number) => {
  const gross = Math.ceil(
    (netCents + STRIPE_FEE_FIXED_CENTS) / (1 - STRIPE_FEE_PCT),
  );
  const fee = Math.max(0, gross - netCents);
  return { grossCents: gross, feeCents: fee };
};

type TradeReviewLocationState = {
  draft?: TradeReviewDraft;
};

type BillingDoc = {
  stripeCustomerId?: string;
  defaultPaymentMethodId?: string;
};

type CarouselItem = {
  key: string;
  imageUrl: string;
  alt: string;
};

const MiniCarousel = ({ items }: { items: CarouselItem[] }) => {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: "start",
  });

  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;

    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());

    onSelect();
    emblaApi.on("select", onSelect);

    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  if (items.length === 0) {
    return <div className="h-24 w-full rounded-xl bg-gray-100" />;
  }

  return (
    <div className="w-full">
      <div
        ref={emblaRef}
        className="overflow-hidden rounded-xl bg-gray-100"
        aria-label="Sneaker carousel"
      >
        <div className="flex">
          {items.map((it) => (
            <div key={it.key} className="min-w-0 flex-[0_0_100%] select-none">
              <div className="flex h-24 w-full items-center justify-center p-2">
                {it.imageUrl ? (
                  <img
                    src={it.imageUrl}
                    alt={it.alt}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="h-full w-full" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {items.length > 1 ? (
        <div className="mt-2 flex items-center justify-center gap-1">
          {items.map((_, i) => (
            <div
              key={`dot-${i}`}
              className={`h-1.5 w-1.5 rounded-full ${
                i === selectedIndex ? "bg-[#3366FF]" : "bg-gray-300"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

type SetupPaymentProps = {
  uid: string;
  onSaved: (paymentMethodId: string) => void;
};

const SetupPaymentForm = ({ uid, onSaved }: SetupPaymentProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();

  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    if (!stripe || !elements || submitting) return;

    setSubmitting(true);

    try {
      const result = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: "if_required",
      });

      if (result.error) {
        toast({
          title: "Payment method not saved",
          description: result.error.message ?? "Please try again.",
          variant: "destructive",
        });
        return;
      }

      const pm = result.setupIntent?.payment_method;
      const paymentMethodId = typeof pm === "string" ? pm : (pm?.id ?? "");

      if (!paymentMethodId) {
        toast({
          title: "Payment method not saved",
          description: "Stripe did not return a payment method id.",
          variant: "destructive",
        });
        return;
      }

      await setDoc(
        doc(db, `users/${uid}/private/billing`),
        {
          defaultPaymentMethodId: paymentMethodId,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      onSaved(paymentMethodId);

      toast({
        title: "Payment method saved",
        description: "You can now send this binding offer.",
      });
    } catch (e) {
      console.error("confirmSetup error:", e);

      toast({
        title: "Payment method not saved",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-gray-200 p-3">
      <PaymentElement />
      <div className="mt-3">
        <Button
          className="w-full bg-[#3366FF]"
          type="button"
          disabled={!stripe || !elements || submitting}
          onClick={handleSave}
        >
          {submitting ? "Saving…" : "Save payment method"}
        </Button>
      </div>
    </div>
  );
};

export const TradeReviewPage = () => {
  // -----------------------------
  // Auth
  // -----------------------------
  const { currentUser } = useAuth();
  const uid = currentUser?.uid ?? "";

  // -----------------------------
  // Routing / location
  // -----------------------------
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // Always compute draft (do NOT early-return before hooks)
  const state = (location.state as TradeReviewLocationState | null) ?? null;
  const draft = state?.draft ?? null;

  // Redirect effect (safe even when draft is null)
  useEffect(() => {
    if (!draft) navigate("/trades/new", { replace: true });
  }, [draft, navigate]);

  // -----------------------------
  // Billing doc (payment readiness)
  // -----------------------------
  const [billingLoading, setBillingLoading] = useState(true);
  const [defaultPaymentMethodId, setDefaultPaymentMethodId] =
    useState<string>("");

  const paymentReady = Boolean(defaultPaymentMethodId);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!uid) {
        if (alive) {
          setDefaultPaymentMethodId("");
          setBillingLoading(false);
        }
        return;
      }

      setBillingLoading(true);

      try {
        const snap = await getDoc(doc(db, `users/${uid}/private/billing`));
        const data =
          (snap.exists() ? (snap.data() as BillingDoc) : null) ?? null;

        if (!alive) return;

        setDefaultPaymentMethodId(data?.defaultPaymentMethodId ?? "");
      } catch (e) {
        console.error("Billing doc read error:", e);

        if (!alive) return;

        setDefaultPaymentMethodId("");
      } finally {
        if (alive) setBillingLoading(false);
      }
    };

    run();

    return () => {
      alive = false;
    };
  }, [uid]);

  // -----------------------------
  // Stripe setup UI state
  // -----------------------------
  const [setupClientSecret, setSetupClientSecret] = useState<string>("");

  // -----------------------------
  // Send Trade (Firestore write)
  // -----------------------------
  const [sending, setSending] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);

  // -----------------------------
  // Derived values (guard draft null)
  // -----------------------------
  const senderSneakerCount = draft?.yourItems.length ?? 0;

  const serviceFeeCents = toCents(
    serviceFeeDollarsForCount(senderSneakerCount),
  );
  const cashDepositCents = toCents(draft?.addCash ?? 0);

  const netCents = cashDepositCents + serviceFeeCents;
  const { grossCents: totalCents, feeCents: processingFeeCents } =
    grossUpForStripe(netCents);

  const showStripeForm = Boolean(setupClientSecret) && !paymentReady;
  const canSend = tosAccepted && paymentReady && !billingLoading;

  const offeringCarouselItems: CarouselItem[] = useMemo(() => {
    const items = draft?.yourItems ?? [];
    return items.map((i) => ({
      key: i.id,
      imageUrl: i.imageUrl ?? "",
      alt: i.name,
    }));
  }, [draft]);

  const requestingCarouselItems: CarouselItem[] = useMemo(() => {
    const items = draft?.theirItems ?? [];
    return items.map((i) => ({
      key: i.id,
      imageUrl: i.imageUrl,
      alt: i.title,
    }));
  }, [draft]);

  const requestSetupIntent = async () => {
    if (!uid || !currentUser) {
      toast({
        title: "Sign in required",
        description: "Please sign in to add a payment method.",
        variant: "destructive",
      });
      return;
    }

    try {
      const idToken = await currentUser.getIdToken();
      const response = await fetch(
        "https://us-central1-barterr-dev-98dfd.cloudfunctions.net/createSetupIntent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data = (await response.json()) as {
        clientSecret?: string;
        defaultPaymentMethodId?: string;
      };

      const existingPm = data.defaultPaymentMethodId ?? "";
      const clientSecret = data.clientSecret ?? "";

      if (existingPm) {
        setDefaultPaymentMethodId(existingPm);
        return;
      }

      if (!clientSecret) {
        toast({
          title: "Couldn't start payment setup",
          description: "Missing Stripe client secret.",
          variant: "destructive",
        });
        return;
      }

      setSetupClientSecret(clientSecret);
    } catch (e) {
      console.error("createSetupIntent error:", e);

      toast({
        title: "Couldn't start payment setup",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSendTrade = async () => {
    if (!draft || !canSend || sending) return;

    const fromUserId = uid;
    const toUserId = draft.theirItems[0]?.userId ?? "";

    if (!fromUserId || !toUserId) {
      toast({
        title: "Couldn’t send trade",
        description:
          "Missing sender or recipient. Please go back and try again.",
        variant: "destructive",
      });
      return;
    }

    setSending(true);

    try {
      const tradeDoc = {
        fromUserId,
        toUserId,
        status: "pending",
        createdAt: serverTimestamp(),

        addCash: draft.addCash,
        askCash: draft.askCash,
        netTotal: draft.netTotal,
        likelihood: draft.likelihood,

        pricingVersion: 1,
        senderSneakerCount,
        senderServiceFeeCents: serviceFeeCents,
        senderCashDepositCents: cashDepositCents,
        senderProcessingFeeCents: processingFeeCents,
        senderTotalCents: totalCents,

        yourListingIds: draft.yourItems.map((i) => i.id),
        theirListingIds: draft.theirItems.map((i) => i.id),

        yourItems: draft.yourItems.map((i) => ({
          listingId: i.id,
          postId: i.postId,
          name: i.name,
          size: i.size,
          value: i.value,
          imageUrl: i.imageUrl ?? "",
          brand: i.brand ?? "",
        })),
        theirItems: draft.theirItems.map((i) => ({
          listingId: i.id,
          postId: i.postId,
          userId: i.userId,
          size: i.size,
          condition: i.condition,
          tradeValue: i.tradeValue,
          title: i.title,
          brand: i.brand,
          imageUrl: i.imageUrl,
        })),
      };

      const ref = await addDoc(collection(db, "trades"), tradeDoc);
      navigate(`/trades/${ref.id}`, { replace: true });
    } catch (e) {
      console.error("Send trade error:", e);

      toast({
        title: "Couldn’t send trade",
        description: "Failed to send trade. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  // Final guard render AFTER hooks
  if (!draft) return null;

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 pb-28 pt-4 md:pb-24">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <div className="flex-1 text-center text-sm font-semibold">
            Review Trade
          </div>

          <div className="w-16" />
        </div>

        {/* Mobile trade meta */}
        <div className="mt-3 flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3 md:hidden">
          <div className="text-sm font-semibold">Trade</div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Net</div>
              <div className="text-sm font-semibold">
                {draft.netTotal >= 0 ? "+" : "-"}$
                {Math.abs(draft.netTotal).toFixed(0)}
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs text-muted-foreground">Likelihood</div>
              <div className="text-sm font-semibold">{draft.likelihood}%</div>
            </div>
          </div>
        </div>

        {/* Mobile compact trade panels */}
        <div className="mt-3 grid grid-cols-2 gap-3 md:hidden">
          <div className="rounded-2xl border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-[#3366FF]">
                You’re offering
              </div>
              {draft.addCash > 0 ? (
                <div className="text-xs font-semibold text-green-600">
                  +${draft.addCash}
                </div>
              ) : null}
            </div>
            <div className="mt-2">
              <MiniCarousel items={offeringCarouselItems} />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-[#3366FF]">
                You’re requesting
              </div>
              {draft.askCash > 0 ? (
                <div className="text-xs font-semibold text-green-600">
                  +${draft.askCash}
                </div>
              ) : null}
            </div>
            <div className="mt-2">
              <MiniCarousel items={requestingCarouselItems} />
            </div>
          </div>
        </div>

        {/* Checkout */}
        <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold">Checkout</div>

          {/* Payment Method row */}
          <div className="mt-3 flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="text-sm text-muted-foreground">Payment Method</div>

            {billingLoading ? (
              <div className="text-sm font-semibold text-muted-foreground">
                Loading…
              </div>
            ) : paymentReady ? (
              <div className="text-sm font-semibold text-green-600">
                Card on file ✓
              </div>
            ) : (
              <button
                type="button"
                onClick={requestSetupIntent}
                className="text-sm font-semibold text-[#3366FF]"
              >
                Add
              </button>
            )}
          </div>

          {showStripeForm ? (
            <div className="mt-3">
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret: setupClientSecret,
                  appearance: { theme: "stripe" },
                }}
              >
                <SetupPaymentForm
                  uid={uid}
                  onSaved={(pmId) => {
                    setDefaultPaymentMethodId(pmId);
                    setSetupClientSecret("");
                  }}
                />
              </Elements>
            </div>
          ) : null}

          {/* Line items */}
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="text-muted-foreground">Cash deposit</div>
              <div className="font-semibold">{formatUsd(cashDepositCents)}</div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="text-muted-foreground">
                Service fee ({senderSneakerCount} sneaker
                {senderSneakerCount === 1 ? "" : "s"})
              </div>
              <div className="font-semibold">{formatUsd(serviceFeeCents)}</div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="text-muted-foreground">Processing fee</div>
              <div className="font-semibold">
                {formatUsd(processingFeeCents)}
              </div>
            </div>
          </div>

          <div className="mt-3 border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Total</div>
              <div className="text-base font-bold">{formatUsd(totalCents)}</div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Charged only after both users confirm.
            </div>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={tosAccepted}
              onChange={(e) => setTosAccepted(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[#3366FF]"
            />
            <span className="text-muted-foreground">
              I agree that this offer is binding once sent and can only be reset
              if declined or countered.
            </span>
          </label>

          {!paymentReady ? (
            <div className="mt-3 text-xs text-muted-foreground">
              Add a payment method to send this binding offer.
            </div>
          ) : null}
        </section>

        {/* Sticky action */}
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <div className="border-t border-gray-200 bg-white/90 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
            <div className="mx-auto w-full max-w-7xl">
              <Button
                className="w-full bg-[#3366FF]"
                disabled={sending || !canSend}
                onClick={handleSendTrade}
              >
                {sending
                  ? "Sending…"
                  : !tosAccepted
                    ? "Agree to continue"
                    : !paymentReady
                      ? "Add payment method to continue"
                      : "Send Trade"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import useEmblaCarousel from "embla-carousel-react";

import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/contexts/auth.context";
import { Button } from "@/components/ui/button";
import type { TradeReviewDraft } from "@/types/index";
import { useToast } from "@/hooks/use-toast";

const DRAFT_STORAGE_KEY = "barterr.tradeReviewDraft.v1";

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
  counterOfTradeId?: string;
};

type BillingDoc = {
  stripeCustomerId?: string;
  defaultPaymentMethodId?: string;
  defaultPaymentMethodBrand?: string;
  defaultPaymentMethodLast4?: string;
  defaultPaymentMethodExpMonth?: number;
  defaultPaymentMethodExpYear?: number;
};

type CardSummary = {
  brand: string;
  last4: string;
  expMonth?: number;
  expYear?: number;
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
              className={`h-1.5 w-1.5 rounded-full ${i === selectedIndex ? "bg-[#3366FF]" : "bg-gray-300"}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const TradeReviewPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const { currentUser } = useAuth();
  const uid = currentUser?.uid ?? "";

  // --- Draft (from route state) ---
  const state = (location.state as TradeReviewLocationState | null) ?? null;
  const draft = state?.draft ?? null;
  const counterOfTradeId = state?.counterOfTradeId ?? null;

  // Persist draft so the payment route can navigate back without losing it
  useEffect(() => {
    if (draft) {
      sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    }
  }, [draft]);

  // If draft missing, kick back
  useEffect(() => {
    if (!draft) navigate("/trades/new", { replace: true });
  }, [draft, navigate]);

  // --- Billing doc ---
  const [billingLoading, setBillingLoading] = useState(true);
  const [defaultPaymentMethodId, setDefaultPaymentMethodId] =
    useState<string>("");
  const [cardSummary, setCardSummary] = useState<CardSummary | null>(null);

  const paymentReady = Boolean(defaultPaymentMethodId);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!uid) {
        if (alive) {
          setDefaultPaymentMethodId("");
          setCardSummary(null);
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

        const pmId = data?.defaultPaymentMethodId ?? "";
        setDefaultPaymentMethodId(pmId);

        const brand = data?.defaultPaymentMethodBrand ?? "";
        const last4 = data?.defaultPaymentMethodLast4 ?? "";

        if (brand && last4) {
          setCardSummary({
            brand,
            last4,
            expMonth: data?.defaultPaymentMethodExpMonth,
            expYear: data?.defaultPaymentMethodExpYear,
          });
        } else {
          setCardSummary(null);
        }
      } catch (e) {
        console.error("Billing doc read error:", e);
        if (!alive) return;
        setDefaultPaymentMethodId("");
        setCardSummary(null);
      } finally {
        if (alive) setBillingLoading(false);
      }
    };

    run();

    return () => {
      alive = false;
    };
  }, [uid]);

  // --- Pricing (guard draft null) ---
  const senderSneakerCount = draft?.yourItems.length ?? 0;
  const serviceFeeCents = toCents(
    serviceFeeDollarsForCount(senderSneakerCount),
  );
  const cashDepositCents = toCents(draft?.addCash ?? 0);

  const netCents = cashDepositCents + serviceFeeCents;
  const { grossCents: totalCents, feeCents: processingFeeCents } =
    grossUpForStripe(netCents);

  // --- Send trade ---
  const [sending, setSending] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);

  const canSend = tosAccepted && paymentReady && !billingLoading;

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

        // Counter trade link (only present on counter trades)
        ...(counterOfTradeId ? { counterOfTradeId } : {}),

        // Sender confirmation (confirmed on send)
        senderConfirmed: true,
        senderConfirmedAt: serverTimestamp(),
        senderSneakerCount,
        senderServiceFeeCents: serviceFeeCents,
        senderCashDepositCents: cashDepositCents,
        senderProcessingFeeCents: processingFeeCents,
        senderTotalCents: totalCents,
        senderPaymentMethodId: defaultPaymentMethodId,

        // Read tracking
        senderRead: true,
        receiverRead: false,

        // Receiver confirmation (set when they accept)
        receiverConfirmed: false,
        receiverConfirmedAt: null,
        receiverSneakerCount: 0,
        receiverServiceFeeCents: 0,
        receiverCashDepositCents: 0,
        receiverProcessingFeeCents: 0,
        receiverTotalCents: 0,
        receiverPaymentMethodId: "",

        // Payment tracking (set when processing)
        senderPaymentIntentId: null,
        senderPaymentStatus: null,
        senderPaymentError: null,
        senderChargedAt: null,

        receiverPaymentIntentId: null,
        receiverPaymentStatus: null,
        receiverPaymentError: null,
        receiverChargedAt: null,

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

      let newTradeId: string;

      if (counterOfTradeId) {
        // Atomic: create counter trade + mark original as countered
        const batch = writeBatch(db);
        const newRef = doc(collection(db, "trades"));
        batch.set(newRef, tradeDoc);
        batch.update(doc(db, "trades", counterOfTradeId), {
          status: "countered",
          counteredByTradeId: newRef.id,
        });
        await batch.commit();
        newTradeId = newRef.id;
      } else {
        const ref = await addDoc(collection(db, "trades"), tradeDoc);
        newTradeId = ref.id;
      }

      navigate(`/trades/${newTradeId}`, { replace: true });
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

  // --- Carousels (memo) ---
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

  // Final guard AFTER hooks
  if (!draft) return null;

  const goToPaymentMethod = () => {
    navigate("/trades/new/review/payment-method", { state: { draft } });
  };

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

        {/* MOBILE meta */}
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

        {/* MOBILE compact panels */}
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

        {/* DESKTOP sneaker display */}
        <div className="mt-4 hidden grid-cols-1 gap-4 md:grid md:grid-cols-2">
          <section className="rounded-2xl border border-gray-200 p-4">
            <div className="text-sm font-semibold">
              You’re offering{" "}
              {draft.addCash > 0 ? (
                <span className="ml-2 text-sm font-semibold text-green-600">
                  +${draft.addCash}
                </span>
              ) : null}
            </div>

            <div className="mt-3 space-y-3">
              {draft.yourItems.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center gap-4 rounded-xl border border-gray-200 p-3"
                >
                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg bg-gray-100 p-2">
                    {i.imageUrl ? (
                      <img
                        src={i.imageUrl}
                        alt={i.name}
                        className="h-full w-full object-contain"
                      />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-base font-semibold">
                      {i.name}
                    </div>
                    <div className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                      {i.brand ? `${i.brand} • ` : ""}
                      {i.size}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-semibold">{i.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 p-4">
            <div className="text-sm font-semibold">
              You’re requesting{" "}
              {draft.askCash > 0 ? (
                <span className="ml-2 text-sm font-semibold text-green-600">
                  +${draft.askCash}
                </span>
              ) : null}
            </div>

            <div className="mt-3 space-y-3">
              {draft.theirItems.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center gap-4 rounded-xl border border-gray-200 p-3"
                >
                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg bg-gray-100 p-2">
                    {i.imageUrl ? (
                      <img
                        src={i.imageUrl}
                        alt={i.title}
                        className="h-full w-full object-contain"
                      />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-base font-semibold">
                      {i.title}
                    </div>
                    <div className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                      Size {i.size} • {i.condition}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-semibold">${i.tradeValue}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
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
              <div className="flex items-center gap-3">
                <div className="text-sm font-semibold">
                  {cardSummary?.brand && cardSummary?.last4
                    ? `${cardSummary.brand.toUpperCase()} •••• ${cardSummary.last4}`
                    : "Card on file"}
                </div>
                <button
                  type="button"
                  onClick={goToPaymentMethod}
                  className="text-sm font-semibold text-[#3366FF]"
                >
                  Change
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={goToPaymentMethod}
                className="text-sm font-semibold text-[#3366FF]"
              >
                Add
              </button>
            )}
          </div>

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

          {/* TOS */}
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

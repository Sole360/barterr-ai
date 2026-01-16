import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import useEmblaCarousel from "embla-carousel-react";

import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/contexts/auth.context";
import { Button } from "@/components/ui/button";
import type { TradeReviewDraft } from "@/types/index";
import { useToast } from "@/hooks/use-toast";

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
    (netCents + STRIPE_FEE_FIXED_CENTS) / (1 - STRIPE_FEE_PCT)
  );
  const fee = Math.max(0, gross - netCents);
  return { grossCents: gross, feeCents: fee };
};

type TradeReviewLocationState = {
  draft?: TradeReviewDraft;
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

export const TradeReviewPage = () => {
  // Hooks must be called at the top level, before any conditional returns
  const { currentUser } = useAuth();
  const [sending, setSending] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);

  // -----------------------------
  // Routing state (Compose -> Review)
  // -----------------------------
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const state = (location.state as TradeReviewLocationState | null) ?? null;
  const draft = state?.draft;

  // If user refreshes Review, navigate state is lost. MVP behavior: send them back.
  useEffect(() => {
    if (!draft) navigate("/trades/new", { replace: true });
  }, [draft, navigate]);

  // Bail early (after the redirect effect fires)
  if (!draft) return null;

  // -----------------------------
  // Pricing (sender-side preview)
  // -----------------------------
  const senderSneakerCount = draft.yourItems.length;
  const serviceFeeCents = toCents(
    serviceFeeDollarsForCount(senderSneakerCount)
  );
  const cashDepositCents = toCents(draft.addCash);

  // What Barterr wants to net (for sender charge) once both confirm:
  const netCents = cashDepositCents + serviceFeeCents;

  // Gross-up so user covers Stripe processing:
  const { grossCents: totalCents, feeCents: processingFeeCents } =
    grossUpForStripe(netCents);

  // -----------------------------
  // Send Trade (Firestore write)
  // -----------------------------

  const handleSendTrade = async () => {
    if (sending) return;

    const fromUserId = currentUser?.uid ?? "";
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

        // Trade summary
        addCash: draft.addCash,
        askCash: draft.askCash,
        netTotal: draft.netTotal,
        likelihood: draft.likelihood,

        // Pricing snapshot (sender side only for now; receiver-side comes on accept)
        pricingVersion: 1,
        senderSneakerCount,
        senderServiceFeeCents: serviceFeeCents,
        senderCashDepositCents: cashDepositCents,
        senderProcessingFeeCents: processingFeeCents,
        senderTotalCents: totalCents,

        yourListingIds: draft.yourItems.map((i) => i.id),
        theirListingIds: draft.theirItems.map((i) => i.id),

        // Lightweight snapshots
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

  // -----------------------------
  // Mobile carousel items
  // -----------------------------
  const offeringCarouselItems: CarouselItem[] = draft.yourItems.map((i) => ({
    key: i.id,
    imageUrl: i.imageUrl ?? "",
    alt: i.name,
  }));

  const requestingCarouselItems: CarouselItem[] = draft.theirItems.map((i) => ({
    key: i.id,
    imageUrl: i.imageUrl,
    alt: i.title,
  }));

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

        {/* -----------------------------
            DESKTOP: Full trade summary + lists
           ----------------------------- */}

        {/* Desktop Trade Summary */}
        <div className="mt-4 hidden rounded-xl border bg-[#3366FF] p-4 text-white shadow-sm md:block">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Trade Summary</div>
            </div>

            <div className="flex shrink-0 items-start gap-6 text-right">
              <div>
                <div className="text-xs text-white/80">Net</div>
                <div className="text-lg font-bold leading-none">
                  {draft.netTotal >= 0 ? "+" : "-"}$
                  {Math.abs(draft.netTotal).toFixed(0)}
                </div>
              </div>

              <div>
                <div className="text-xs text-white/80">Likelihood</div>
                <div className="text-lg font-bold leading-none">
                  {draft.likelihood}%
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-white/10 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Cash that you added</div>
                <div className="text-sm font-semibold">${draft.addCash}</div>
              </div>
              <input
                type="range"
                min={0}
                max={500}
                step={10}
                value={draft.addCash}
                disabled
                className="mt-2 w-full accent-white"
              />
            </div>

            <div className="rounded-lg bg-white/10 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">
                  Cash that you're asking for
                </div>
                <div className="text-sm font-semibold">${draft.askCash}</div>
              </div>
              <input
                type="range"
                min={0}
                max={500}
                step={10}
                value={draft.askCash}
                disabled
                className="mt-2 w-full accent-white"
              />
            </div>
          </div>
        </div>

        {/* -----------------------------
            MOBILE: Compact trade meta + carousels + checkout
           ----------------------------- */}

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

        {/* Mobile compact trade panels (side-by-side) */}
        <div className="mt-3 grid grid-cols-2 gap-3 md:hidden">
          {/* Offering */}
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

          {/* Requesting */}
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

        {/* Checkout (mobile + desktop) */}
        <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold">Checkout</div>

          {/* Payment Method row (placeholder for Stripe step) */}
          <div className="mt-3 flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="text-sm text-muted-foreground">Payment Method</div>

            <button
              type="button"
              onClick={() => {
                toast({
                  title: "Payment method",
                  description: "Stripe setup is the next step.",
                });
              }}
              className="text-sm font-semibold text-[#3366FF]"
            >
              Add
            </button>
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
        </section>

        {/* Desktop two-sided review */}
        <div className="mt-4 hidden grid-cols-1 gap-4 md:grid md:grid-cols-2">
          {/* Your side */}
          <section className="rounded-2xl border border-gray-200 p-4">
            <div className="text-sm font-semibold">You’re offering</div>

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

          {/* Their side */}
          <section className="rounded-2xl border border-gray-200 p-4">
            <div className="text-sm font-semibold">You’re requesting</div>

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

        {/* Sticky action */}
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <div className="border-t border-gray-200 bg-white/90 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
            <div className="mx-auto w-full max-w-7xl">
              <Button
                className="w-full bg-[#3366FF]"
                disabled={sending || !tosAccepted}
                onClick={handleSendTrade}
              >
                {sending
                  ? "Sending…"
                  : tosAccepted
                  ? "Send Trade"
                  : "Agree to continue"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

import { db } from "@/lib/firebase/config";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import type { Order, TrackingInfo } from "@/types";

// ─── Shippo rate shape returned by createShippoLabel ──────────────────────────

interface ShippoRate {
  object_id: string;
  amount: string;
  currency: string;
  provider: string;
  servicelevel: { name: string; token: string };
  estimated_days?: number;
}

// ─── Step indicator ────────────────────────────────────────────────────────────

type StepState = "done" | "active" | "upcoming";

function Step({
  state,
  label,
  sublabel,
}: {
  state: StepState;
  label: string;
  sublabel?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold
          ${state === "done" ? "bg-green-500 text-white" : ""}
          ${state === "active" ? "border-2 border-[#3366FF] text-[#3366FF]" : ""}
          ${state === "upcoming" ? "border-2 border-gray-200 text-gray-300" : ""}
        `}
      >
        {state === "done" ? "✓" : ""}
      </div>
      <div className="min-w-0">
        <div
          className={`text-sm ${
            state === "done"
              ? "text-foreground"
              : state === "active"
                ? "font-medium text-foreground"
                : "text-muted-foreground"
          }`}
        >
          {label}
        </div>
        {sublabel && (
          <div className="mt-0.5 text-xs text-muted-foreground">{sublabel}</div>
        )}
      </div>
    </div>
  );
}

// ─── Tracking card ────────────────────────────────────────────────────────────

function TrackingCard({
  tracking,
  showLabel,
}: {
  tracking: TrackingInfo;
  showLabel: boolean;
}) {
  const trackUrl = (carrier: string, num: string) => {
    if (carrier === "USPS")
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${num}`;
    if (carrier === "UPS") return `https://www.ups.com/track?tracknum=${num}`;
    if (carrier === "FedEx")
      return `https://www.fedex.com/apps/fedextrack/?trackingnumber=${num}`;
    return "";
  };

  const trackLink = trackUrl(tracking.carrier, tracking.tracking);

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-white p-3">
      <div className="text-xs text-muted-foreground">
        {tracking.carrier} · {tracking.tracking}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {showLabel && tracking.label && (
          <a
            href={tracking.label}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
          >
            Print Label
          </a>
        )}
        {trackLink && (
          <a
            href={trackLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-md bg-[#3366FF] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3366FF]/90"
          >
            Track Package
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Per-party shipping row ───────────────────────────────────────────────────

type LabelStep = "idle" | "loading_rates" | "select_rate" | "purchasing";

function PartyShipRow({
  label,
  isMe,
  tracking,
  received,
  onGetLabel,
}: {
  label: string;
  isMe: boolean;
  tracking?: TrackingInfo;
  received?: boolean;
  onGetLabel: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        {received && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
            Received by Barterr
          </span>
        )}
      </div>

      {tracking ? (
        <TrackingCard tracking={tracking} showLabel={isMe} />
      ) : isMe ? (
        <button
          type="button"
          onClick={onGetLabel}
          className="mt-1 text-sm font-semibold text-[#3366FF] hover:underline"
        >
          Get shipping label →
        </button>
      ) : (
        <div className="text-xs text-muted-foreground">Not yet shipped</div>
      )}
    </div>
  );
}

// ─── Rate selector ────────────────────────────────────────────────────────────

function RateSelector({
  rates,
  selected,
  onSelect,
  onPurchase,
  onCancel,
  purchasing,
}: {
  rates: ShippoRate[];
  selected: ShippoRate | null;
  onSelect: (r: ShippoRate) => void;
  onPurchase: () => void;
  onCancel: () => void;
  purchasing: boolean;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-[#3366FF]/30 bg-blue-50 p-4">
      <div className="text-sm font-semibold">Choose a shipping option</div>
      <div className="space-y-2">
        {rates.map((r) => (
          <button
            key={r.object_id}
            type="button"
            onClick={() => onSelect(r)}
            className={`w-full rounded-lg border p-3 text-left transition-colors ${
              selected?.object_id === r.object_id
                ? "border-[#3366FF] bg-white"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{r.provider}</div>
                <div className="text-xs text-muted-foreground">
                  {r.servicelevel.name}
                  {r.estimated_days != null
                    ? ` · ${r.estimated_days} day${r.estimated_days === 1 ? "" : "s"}`
                    : ""}
                </div>
              </div>
              <div className="text-sm font-bold">
                ${parseFloat(r.amount).toFixed(2)}
              </div>
            </div>
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1 bg-[#3366FF] hover:bg-[#3366FF]/90"
          disabled={!selected || purchasing}
          onClick={onPurchase}
        >
          {purchasing ? "Purchasing…" : "Purchase Label"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={purchasing}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  tradeId: string;
  /** true = current user is the original trade sender (fromUserId) */
  isSender: boolean;
}

export function ShippingSection({ tradeId, isSender }: Props) {
  const { toast } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [orderLoading, setOrderLoading] = useState(true);

  // Label-flow state
  const [labelStep, setLabelStep] = useState<LabelStep>("idle");
  const [rates, setRates] = useState<ShippoRate[]>([]);
  const [selectedRate, setSelectedRate] = useState<ShippoRate | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "orders", tradeId), (snap) => {
      setOrder(snap.exists() ? (snap.data() as Order) : null);
      setOrderLoading(false);
    });
    return () => unsub();
  }, [tradeId]);

  // ── Derived state ────────────────────────────────────────────────────────

  const myTracking = isSender ? order?.trackingSender : order?.trackingPoster;
  const theirTracking = isSender ? order?.trackingPoster : order?.trackingSender;
  const myReceived = isSender
    ? order?.sender.sneakerReceived
    : order?.poster.sneakerReceived;
  const theirReceived = isSender
    ? order?.poster.sneakerReceived
    : order?.sender.sneakerReceived;
  const myAuthenticated = isSender
    ? order?.sender.authenticated
    : order?.poster.authenticated;
  const theirAuthenticated = isSender
    ? order?.poster.authenticated
    : order?.sender.authenticated;
  const myOutbound = isSender ? order?.senderOutbound : order?.posterOutbound;
  const otherName = isSender ? order?.poster.name : order?.sender.name;

  const authFailed =
    !!order?.fakes &&
    order.fakes.userId ===
      (isSender ? order?.sender.id : order?.poster.id);

  // ── Overall stage for step indicator ────────────────────────────────────

  const bothShipped = !!myTracking && !!theirTracking;
  const bothReceived = !!myReceived && !!theirReceived;
  const bothAuthenticated = !!myAuthenticated && !!theirAuthenticated;
  const outboundReady = !!myOutbound;

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleGetRates = async () => {
    setLabelStep("loading_rates");
    try {
      const fns = getFunctions(undefined, "us-central1");
      const fn = httpsCallable<
        { tradeId: string },
        { rates: ShippoRate[]; shipmentObjectId: string }
      >(fns, "createShippoLabel");

      const result = await fn({ tradeId });
      if (!result.data.rates.length) {
        toast({
          title: "No rates available",
          description:
            "No shipping rates found for your address. Please check your profile.",
          variant: "destructive",
        });
        setLabelStep("idle");
        return;
      }
      setRates(result.data.rates);
      setSelectedRate(result.data.rates[0]);
      setLabelStep("select_rate");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to get shipping rates";
      toast({ title: "Error", description: msg, variant: "destructive" });
      setLabelStep("idle");
    }
  };

  const handlePurchaseLabel = async () => {
    if (!selectedRate) return;
    setLabelStep("purchasing");
    try {
      const fns = getFunctions(undefined, "us-central1");
      const fn = httpsCallable<
        { tradeId: string; rateObjectId: string; carrier: string },
        TrackingInfo
      >(fns, "createShippoTransaction");

      await fn({
        tradeId,
        rateObjectId: selectedRate.object_id,
        carrier: selectedRate.provider,
      });

      toast({
        title: "Label purchased!",
        description: "Check your email for a copy of the label.",
      });
      setLabelStep("idle");
      setRates([]);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to purchase label";
      toast({ title: "Error", description: msg, variant: "destructive" });
      setLabelStep("select_rate");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (orderLoading) {
    return (
      <div className="mt-6 rounded-2xl border border-gray-200 p-4">
        <div className="text-sm text-muted-foreground">
          Loading shipping details…
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mt-6 rounded-2xl border border-gray-200 p-4">
        <div className="text-sm text-muted-foreground">
          Preparing shipment details — check back in a moment.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5 rounded-2xl border border-gray-200 p-5 shadow-sm">
      {/* Header */}
      <div>
        <div className="text-base font-semibold">Shipping &amp; Authentication</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Both parties ship their sneakers to Barterr. We authenticate them
          before forwarding to their new owners.
        </div>
      </div>

      {/* ── Phase 1: Ship to Barterr ──────────────────────────────────────── */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          1 · Ship to Barterr
        </div>

        <div className="mb-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Ship to: </span>
          Barterr · 1932 Clinton St · Los Angeles, CA 90026
        </div>

        <div className="space-y-2">
          <PartyShipRow
            label="Your shipment"
            isMe={true}
            tracking={myTracking}
            received={myReceived}
            onGetLabel={handleGetRates}
          />
          <PartyShipRow
            label={`${otherName ?? "Other party"}'s shipment`}
            isMe={false}
            tracking={theirTracking}
            received={theirReceived}
            onGetLabel={() => {}}
          />
        </div>

        {/* Rate selector — shown inline when user clicks "Get shipping label" */}
        {(labelStep === "select_rate" || labelStep === "purchasing") && (
          <div className="mt-3">
            <RateSelector
              rates={rates}
              selected={selectedRate}
              onSelect={setSelectedRate}
              onPurchase={handlePurchaseLabel}
              onCancel={() => {
                setLabelStep("idle");
                setRates([]);
              }}
              purchasing={labelStep === "purchasing"}
            />
          </div>
        )}

        {labelStep === "loading_rates" && (
          <div className="mt-3 text-sm text-muted-foreground">
            Fetching rates…
          </div>
        )}
      </div>

      {/* ── Phase 2: Authentication ────────────────────────────────────────── */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          2 · Authentication
        </div>
        <div className="space-y-2">
          <Step
            state={
              myAuthenticated ? "done" : bothReceived ? "active" : "upcoming"
            }
            label={`Your sneakers${myAuthenticated ? " — passed ✓" : authFailed ? " — failed" : ""}`}
            sublabel={
              authFailed
                ? order.fakes?.reasons
                : bothReceived && !myAuthenticated
                  ? "Under review at Barterr"
                  : undefined
            }
          />
          <Step
            state={
              theirAuthenticated
                ? "done"
                : bothReceived
                  ? "active"
                  : "upcoming"
            }
            label={`${otherName ?? "Other party"}'s sneakers${theirAuthenticated ? " — passed ✓" : ""}`}
            sublabel={
              bothReceived && !theirAuthenticated
                ? "Under review at Barterr"
                : undefined
            }
          />
        </div>

        {authFailed && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="text-sm font-semibold text-red-800">
              Authentication Issue
            </div>
            <div className="mt-1 text-xs text-red-700">
              {order.fakes?.reasons ||
                "Please check your email for details from the Barterr team."}
            </div>
          </div>
        )}
      </div>

      {/* ── Phase 3: Outbound ─────────────────────────────────────────────── */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          3 · On the Way to You
        </div>
        <Step
          state={
            outboundReady ? "done" : bothAuthenticated ? "active" : "upcoming"
          }
          label={
            outboundReady
              ? "Barterr has shipped your sneakers"
              : bothAuthenticated
                ? "Barterr is preparing your outbound shipment"
                : "Pending authentication"
          }
        />
        {myOutbound && (
          <div className="mt-2">
            <TrackingCard tracking={myOutbound} showLabel={false} />
          </div>
        )}
      </div>

      {/* ── Phase 4: Complete ─────────────────────────────────────────────── */}
      <div>
        <Step
          state={order.completed ? "done" : "upcoming"}
          label="Trade complete"
          sublabel={
            order.completed
              ? "Your new sneakers are on their way!"
              : bothShipped
                ? "Waiting on authentication and outbound shipping"
                : "Complete all steps above to finish your trade"
          }
        />
      </div>
    </div>
  );
}

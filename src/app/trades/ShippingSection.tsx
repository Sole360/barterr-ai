import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { db } from "@/lib/firebase/config";
import { useToast } from "@/hooks/use-toast";
import { usePurchaseLabel } from "@/lib/query/hooks/useShipping";
import type { Order, TrackingInfo } from "@/types";

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
    <div className="mt-2 rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">
        {tracking.carrier} · {tracking.tracking}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {showLabel && tracking.label && (
          <a
            href={tracking.label}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
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

function PartyShipRow({
  label,
  isMe,
  tracking,
  received,
  loading,
  onGetLabel,
}: {
  label: string;
  isMe: boolean;
  tracking?: TrackingInfo;
  received?: boolean;
  loading?: boolean;
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
          disabled={loading}
          className="mt-1 text-sm font-semibold text-[#3366FF] hover:underline disabled:opacity-50"
        >
          {loading ? "Getting label…" : "Get shipping label →"}
        </button>
      ) : (
        <div className="text-xs text-muted-foreground">Not yet shipped</div>
      )}
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
  const purchaseLabel = usePurchaseLabel(tradeId);

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
    order.fakes.userId === (isSender ? order?.sender.id : order?.poster.id);

  const bothShipped = !!myTracking && !!theirTracking;
  const bothReceived = !!myReceived && !!theirReceived;
  const bothAuthenticated = !!myAuthenticated && !!theirAuthenticated;
  const outboundReady = !!myOutbound;

  // ── Handler ──────────────────────────────────────────────────────────────

  const handleGetLabel = () => {
    purchaseLabel.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: "Label purchased!",
          description: "Check your email for a copy of the label.",
        });
      },
    });
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
            loading={purchaseLabel.isPending}
            onGetLabel={handleGetLabel}
          />
          <PartyShipRow
            label={`${otherName ?? "Other party"}'s shipment`}
            isMe={false}
            tracking={theirTracking}
            received={theirReceived}
            onGetLabel={() => {}}
          />
        </div>
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
              theirAuthenticated ? "done" : bothReceived ? "active" : "upcoming"
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

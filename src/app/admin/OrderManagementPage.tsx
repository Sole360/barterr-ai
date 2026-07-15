import { useEffect, useState } from "react";
import { collection, doc, getDoc, onSnapshot, orderBy, query } from "firebase/firestore";
import { CheckCircle2, Circle, Package } from "lucide-react";
import { db } from "@/lib/firebase/config";
import { format } from "date-fns";
import { OrderDetailPanel } from "./OrderDetailPanel";
import type { Timestamp } from "firebase/firestore";

interface TrackingInfo {
  carrier: string;
  tracking: string;
  label: string;
}

interface OrderParty {
  id: string;
  name: string;
  email: string;
  sneakerReceived?: boolean;
  authenticated?: boolean;
}

interface SneakerItem {
  id?: string; // listingId
  imageUrl?: string;
  name?: string;
  title?: string;
}

interface OrderDoc {
  id: string;
  tradeId: string;
  fromUserId: string;
  toUserId: string;
  sender: OrderParty;
  poster: OrderParty;
  tradeDeal?: {
    senderOffer: { sneakers: SneakerItem[]; cash: number };
    posterOffer: { sneakers: SneakerItem[]; cash: number };
  };
  trackingSender?: TrackingInfo;
  trackingPoster?: TrackingInfo;
  senderOutbound?: TrackingInfo;
  posterOutbound?: TrackingInfo;
  fakes?: { userId: string; reasons: string };
  completed: boolean;
  status?: string;
  confirmedAt: Timestamp | null;
}

interface UserAddress {
  street?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
}

type FilterTab = "all" | "in_progress" | "completed" | "cancelled";

function StepDot({ done }: { done: boolean }) {
  return done
    ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
    : <Circle className="w-4 h-4 text-muted-foreground/40" />;
}

function ProgressBar({ order }: { order: OrderDoc }) {
  const steps = [
    order.sender.sneakerReceived,
    order.poster.sneakerReceived,
    order.sender.authenticated && order.poster.authenticated,
    !!order.senderOutbound && !!order.posterOutbound,
  ];
  const doneCount = steps.filter(Boolean).length;
  const labels = ["Received (S)", "Received (P)", "Authenticated", "Outbound"];

  return (
    <div className="flex items-center gap-2 mt-2">
      {steps.map((done, i) => (
        <div key={i} className="flex items-center gap-1">
          <StepDot done={!!done} />
          <span className="text-[10px] text-muted-foreground hidden sm:block">{labels[i]}</span>
          {i < steps.length - 1 && <div className="w-4 h-px bg-border hidden sm:block" />}
        </div>
      ))}
      <span className="ml-auto text-[10px] text-muted-foreground">{doneCount}/4</span>
    </div>
  );
}

export const OrderManagementPage = () => {
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [selectedOrder, setSelectedOrder] = useState<OrderDoc | null>(null);
  const [addresses, setAddresses] = useState<{ sender?: UserAddress; poster?: UserAddress }>({});
  const [photos, setPhotos] = useState<{ sender: string[]; poster: string[] }>({ sender: [], poster: [] });

  useEffect(() => {
    const q = query(collection(db, "orders"), orderBy("confirmedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrderDoc, "id">) })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // When an order is selected, fetch addresses and listing verification photos
  useEffect(() => {
    if (!selectedOrder) { setAddresses({}); setPhotos({ sender: [], poster: [] }); return; }
    let cancelled = false;

    const fetchOrderData = async () => {
      const senderListingIds = (selectedOrder.tradeDeal?.senderOffer.sneakers ?? [])
        .map((s) => s.id).filter((id): id is string => !!id);
      const posterListingIds = (selectedOrder.tradeDeal?.posterOffer.sneakers ?? [])
        .map((s) => s.id).filter((id): id is string => !!id);

      const allListingIds = [...senderListingIds, ...posterListingIds];

      const [senderSnap, posterSnap, ...listingSnaps] = await Promise.all([
        getDoc(doc(db, "users", selectedOrder.fromUserId)),
        getDoc(doc(db, "users", selectedOrder.toUserId)),
        ...allListingIds.map((id) => getDoc(doc(db, "listings", id))),
      ]);

      if (cancelled) return;

      setAddresses({
        sender: senderSnap.data()?.address,
        poster: posterSnap.data()?.address,
      });

      const getListingPhotos = (ids: string[]) =>
        ids.flatMap((id) => {
          const snap = listingSnaps.find((s) => s.id === id);
          if (!snap?.exists()) return [];
          const d = snap.data();
          return [d.productImageUrl, ...(d.verificationPhotos ?? [])].filter(Boolean) as string[];
        });

      setPhotos({
        sender: getListingPhotos(senderListingIds),
        poster: getListingPhotos(posterListingIds),
      });
    };

    fetchOrderData();
    return () => { cancelled = true; };
  }, [selectedOrder?.id]);

  // Keep selected order in sync with live updates
  useEffect(() => {
    if (!selectedOrder) return;
    const live = orders.find((o) => o.id === selectedOrder.id);
    if (live) setSelectedOrder(live);
  }, [orders]);

  const filtered = orders.filter((o) => {
    if (filter === "completed") return o.completed;
    if (filter === "in_progress") return !o.completed && o.status !== "cancelled";
    if (filter === "cancelled") return o.status === "cancelled";
    return true;
  });

  const TABS: { label: string; value: FilterTab }[] = [
    { label: "All", value: "all" },
    { label: "In Progress", value: "in_progress" },
    { label: "Completed", value: "completed" },
    { label: "Cancelled", value: "cancelled" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Order Management</h1>
        <p className="text-sm text-muted-foreground mt-1">Fulfillment pipeline for completed trades</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setFilter(t.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === t.value
                ? "bg-[#3366FF] text-white"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground self-center">
          {filtered.length} {filtered.length === 1 ? "order" : "orders"}
        </span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <Package className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {filter === "all" ? "No orders yet." : `No ${filter.replace("_", " ")} orders.`}
          </p>
        </div>
      )}

      {/* Order cards */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((order) => (
            <button
              key={order.id}
              type="button"
              onClick={() => setSelectedOrder(order)}
              className="w-full text-left rounded-2xl border border-border bg-card p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)] hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-semibold text-foreground">
                    {order.sender.name} ↔ {order.poster.name}
                  </div>
                  {order.completed && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      Completed
                    </span>
                  )}
                  {order.status === "cancelled" && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      Cancelled
                    </span>
                  )}
                </div>
                <div className="shrink-0 text-[11px] text-muted-foreground text-right">
                  {order.confirmedAt
                    ? format(order.confirmedAt.toDate(), "MMM d, yyyy")
                    : "—"}
                </div>
              </div>
              <ProgressBar order={order} />
            </button>
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selectedOrder && (
        <OrderDetailPanel
          order={selectedOrder}
          addresses={addresses}
          photos={photos}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </div>
  );
};

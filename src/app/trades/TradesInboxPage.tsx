import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/contexts/auth.context";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import type { TradeDocument } from "@/types";

export const TradesInboxPage = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [sent, setSent] = useState<(TradeDocument & { id: string })[]>([]);
  const [received, setReceived] = useState<(TradeDocument & { id: string })[]>(
    []
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser?.uid) return;

    setLoading(true);

    const tradesRef = collection(db, "trades");

    const qSent = query(
      tradesRef,
      where("fromUserId", "==", currentUser.uid),
      orderBy("createdAt", "desc")
    );

    const qReceived = query(
      tradesRef,
      where("toUserId", "==", currentUser.uid),
      orderBy("createdAt", "desc")
    );

    const unsubSent = onSnapshot(
      qSent,
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as TradeDocument),
        }));
        setSent(rows);
        setLoading(false);
      },
      (err) => {
        console.error("Trades sent snapshot error:", err);
        setSent([]);
        setLoading(false);
      }
    );

    const unsubReceived = onSnapshot(
      qReceived,
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as TradeDocument),
        }));
        setReceived(rows);
        setLoading(false);
      },
      (err) => {
        console.error("Trades received snapshot error:", err);
        setReceived([]);
        setLoading(false);
      }
    );

    return () => {
      unsubSent();
      unsubReceived();
    };
  }, [currentUser?.uid]);

  const hasAny = useMemo(
    () => (sent?.length ?? 0) + (received?.length ?? 0) > 0,
    [sent, received]
  );

  const TradeRow = ({
    t,
    mode,
  }: {
    t: TradeDocument & { id: string };
    mode: "sent" | "received";
  }) => {
    // For display, we show sneaker counts and cash from the trade
    const yourSneaks = t.yourItems?.length ?? 0;
    const theirSneaks = t.theirItems?.length ?? 0;
    const yourCash = t.addCash ?? 0;
    const theirCash = t.askCash ?? 0;

    // Derive status text from the new status field
    const status = useMemo(() => {
      if (t.status === "declined") return "Declined";
      if (t.status === "completed") return "Completed";
      if (t.status === "failed") return "Payment Failed";
      if (t.status === "processing") return "Processing";
      if (t.status === "both_confirmed") return "Confirmed";

      // Pending state
      if (mode === "sent") {
        return t.receiverConfirmed ? "Accepted" : "Pending";
      } else {
        return t.receiverConfirmed ? "You accepted" : "Action needed";
      }
    }, [t.status, t.receiverConfirmed, mode]);

    // Status badge colors
    const statusColor = useMemo(() => {
      switch (t.status) {
        case "completed":
          return "border-green-200 bg-green-50 text-green-700";
        case "failed":
          return "border-red-200 bg-red-50 text-red-700";
        case "declined":
          return "border-gray-200 bg-gray-50 text-gray-500";
        case "processing":
        case "both_confirmed":
          return "border-blue-200 bg-blue-50 text-blue-700";
        default:
          return t.receiverConfirmed
            ? "border-green-200 bg-green-50 text-green-700"
            : mode === "received"
              ? "border-orange-200 bg-orange-50 text-orange-700"
              : "";
      }
    }, [t.status, t.receiverConfirmed, mode]);

    return (
      <button
        type="button"
        className="w-full text-left"
        onClick={() => navigate(`/trades/${t.id}`)}
      >
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                Trade #{t.id.slice(-6)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {mode === "sent" ? "You offer" : "They offer"}: {yourSneaks}{" "}
                sneaker{yourSneaks === 1 ? "" : "s"}
                {yourCash ? ` + $${yourCash}` : ""}
                {" • "}
                {mode === "sent" ? "For" : "You give"}: {theirSneaks} sneaker
                {theirSneaks === 1 ? "" : "s"}
                {theirCash ? ` + $${theirCash}` : ""}
              </div>
            </div>

            <div
              className={`shrink-0 rounded-full border px-2 py-1 text-xs ${statusColor}`}
            >
              {status}
            </div>
          </div>
        </Card>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:max-w-4xl xl:max-w-5xl">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Trades</h1>
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            Back
          </Button>
        </div>

        <div className="mt-4 space-y-6">
          {loading && !hasAny ? (
            <div className="text-sm text-muted-foreground">Loading trades…</div>
          ) : null}

          {!loading && !hasAny ? (
            <div className="text-sm text-muted-foreground">No trades yet.</div>
          ) : null}

          {received?.length ? (
            <div className="space-y-3">
              <div className="text-sm font-semibold">Received</div>
              <div className="space-y-2">
                {received.map((t) => (
                  <TradeRow key={t.id} t={t} mode="received" />
                ))}
              </div>
            </div>
          ) : null}

          {received?.length && sent?.length ? <Separator /> : null}

          {sent?.length ? (
            <div className="space-y-3">
              <div className="text-sm font-semibold">Sent</div>
              <div className="space-y-2">
                {sent.map((t) => (
                  <TradeRow key={t.id} t={t} mode="sent" />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

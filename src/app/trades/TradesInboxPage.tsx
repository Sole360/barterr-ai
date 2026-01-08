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

import type { Trade } from "@/types";

export const TradesInboxPage = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [sent, setSent] = useState<Trade[]>([]);
  const [received, setReceived] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser?.uid) return;

    setLoading(true);

    const tradeRequestsRef = collection(db, "tradeRequests");

    const qSent = query(
      tradeRequestsRef,
      where("senderId", "==", currentUser.uid),
      orderBy("sentAt", "desc")
    );

    const qReceived = query(
      tradeRequestsRef,
      where("posterId", "==", currentUser.uid),
      orderBy("sentAt", "desc")
    );

    const unsubSent = onSnapshot(
      qSent,
      (snap) => {
        const rows = snap.docs.map((d) => d.data() as Trade);
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
        const rows = snap.docs.map((d) => d.data() as Trade);
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

  const TradeRow = ({ t, mode }: { t: Trade; mode: "sent" | "received" }) => {
    const otherName = mode === "sent" ? t.posterName : t.senderName;

    const yourOffer = t.yourOffer;
    const theirOffer = t.theirOffer;

    const yourSneaks = yourOffer?.sneakers?.length ?? 0;
    const theirSneaks = theirOffer?.sneakers?.length ?? 0;

    const yourCash = yourOffer?.cash ?? 0;
    const theirCash = theirOffer?.cash ?? 0;

    const status = t.declined
      ? "Declined"
      : t.senderConfirm && t.posterConfirm
      ? "Accepted"
      : mode === "sent"
      ? t.posterConfirm
        ? "Accepted"
        : "Pending"
      : t.posterConfirm
      ? "You accepted"
      : "Action needed";

    return (
      <button
        type="button"
        className="w-full text-left"
        onClick={() => navigate(`/trades/${t.tradeId}`)}
      >
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{otherName}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Your offer: {yourSneaks} sneaker{yourSneaks === 1 ? "" : "s"}
                {yourCash ? ` + $${yourCash}` : ""}
                {" • "}
                Their offer: {theirSneaks} sneaker{theirSneaks === 1 ? "" : "s"}
                {theirCash ? ` + $${theirCash}` : ""}
              </div>
            </div>

            <div className="shrink-0 rounded-full border px-2 py-1 text-xs">
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
                  <TradeRow key={t.tradeId} t={t} mode="received" />
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
                  <TradeRow key={t.tradeId} t={t} mode="sent" />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

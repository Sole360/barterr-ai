import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";

import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/contexts/auth.context";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

import type { Sneaker, Trade } from "@/types";

type TradeUpdate = {
  senderRead?: boolean;
  posterRead?: boolean;
  senderConfirm?: boolean;
  posterConfirm?: boolean;
  declined?: boolean;
};

function formatCash(n?: number) {
  const v = Number(n ?? 0);
  return v ? `$${v}` : "$0";
}

function SneakerRow({ s }: { s: Sneaker }) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      <img
        src={s.productImageUrl}
        alt={s.name}
        className="h-12 w-12 rounded object-cover"
        loading="lazy"
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{s.name}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {s.size ? `US ${s.size}` : ""}
          {s.condition != null ? ` • Cond ${s.condition}` : ""}
        </div>
      </div>
    </div>
  );
}

export const TradeDetailPage = () => {
  const navigate = useNavigate();
  const { tradeId } = useParams();
  const { currentUser } = useAuth();
  const { toast } = useToast();

  const [trade, setTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!tradeId) return;

    setLoading(true);
    const ref = doc(db, "tradeRequests", tradeId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setTrade(null);
          setLoading(false);
          return;
        }
        setTrade(snap.data() as Trade);
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

  const isSender = useMemo(() => {
    if (!currentUser?.uid || !trade) return false;
    return trade.senderId === currentUser.uid;
  }, [currentUser?.uid, trade]);

  const isPoster = useMemo(() => {
    if (!currentUser?.uid || !trade) return false;
    return trade.posterId === currentUser.uid;
  }, [currentUser?.uid, trade]);

  const otherName = useMemo(() => {
    if (!trade) return "";
    return isSender ? trade.posterName : trade.senderName;
  }, [trade, isSender]);

  const statusText = useMemo(() => {
    if (!trade) return "";
    if (trade.declined) return "Declined";
    if (trade.senderConfirm && trade.posterConfirm) return "Accepted";
    if (isPoster) return trade.posterConfirm ? "You accepted" : "Action needed";
    return trade.posterConfirm ? "Accepted" : "Pending";
  }, [trade, isPoster]);

  useEffect(() => {
    if (!tradeId || loading || !trade || !currentUser?.uid) return;

    const patch: TradeUpdate = {};
    if (isSender && !trade.senderRead) patch.senderRead = true;
    if (isPoster && !trade.posterRead) patch.posterRead = true;

    if (!Object.keys(patch).length) return;

    // fire-and-forget; not worth blocking UI
    updateDoc(doc(db, "tradeRequests", tradeId), patch).catch((e) => {
      console.warn("Failed to mark trade read:", e);
    });
  }, [tradeId, loading, trade, currentUser?.uid, isSender, isPoster]);

  const handleAccept = async () => {
    if (!tradeId || !trade || !isPoster) return;

    setActing(true);
    try {
      const patch: TradeUpdate = {
        posterConfirm: true,
        posterRead: true,
      };

      await updateDoc(doc(db, "tradeRequests", tradeId), patch);

      toast({ title: "Trade accepted" });
    } catch (err) {
      console.error("Accept trade error:", err);
      toast({
        title: "Error",
        description: "Failed to accept trade",
        variant: "destructive",
      });
    } finally {
      setActing(false);
    }
  };

  const handleDecline = async () => {
    if (!tradeId || !trade || !isPoster) return;

    setActing(true);
    try {
      const patch: TradeUpdate = {
        declined: true,
        posterRead: true,
      };

      await updateDoc(doc(db, "tradeRequests", tradeId), patch);

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

  // client-side guard (rules enforce this too)
  if (!isSender && !isPoster) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:max-w-4xl xl:max-w-5xl">
          <Button variant="ghost" onClick={() => navigate("/trades")}>
            Back
          </Button>
          <div className="mt-4 text-sm text-muted-foreground">
            You don’t have access to this trade.
          </div>
        </div>
      </div>
    );
  }

  const theirSneaks = trade.theirOffer?.sneakers ?? [];
  const yourSneaks = trade.yourOffer?.sneakers ?? [];

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:max-w-4xl xl:max-w-5xl">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => navigate("/trades")}>
            Back
          </Button>

          <div className="min-w-0 text-right">
            <div className="truncate text-sm font-semibold">{otherName}</div>
            <div className="text-xs text-muted-foreground">{statusText}</div>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          {/* Their Offer */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Their Offer</h2>
              <div className="text-sm">
                {formatCash(trade.theirOffer?.cash)}
              </div>
            </div>

            {theirSneaks.length ? (
              <div className="space-y-2">
                {theirSneaks.map((s, idx) => (
                  <SneakerRow
                    key={`${s.apiID ?? s.styleId ?? s.name}-${idx}`}
                    s={s}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                No sneakers included.
              </div>
            )}
          </section>

          {/* Your Offer */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Your Offer</h2>
              <div className="text-sm">{formatCash(trade.yourOffer?.cash)}</div>
            </div>

            {yourSneaks.length ? (
              <div className="space-y-2">
                {yourSneaks.map((s, idx) => (
                  <SneakerRow
                    key={`${s.apiID ?? s.styleId ?? s.name}-${idx}`}
                    s={s}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                No sneakers included.
              </div>
            )}
          </section>

          {/* Actions (receiver only for now) */}
          {isPoster && !trade.declined && !trade.posterConfirm ? (
            <div className="space-y-3 pt-2">
              <div className="text-xs text-muted-foreground">
                Accepting is binding. If you accept, the trade can proceed
                immediately.
              </div>

              <div className="flex gap-3">
                <Button
                  className="flex-1 bg-[#3366FF] hover:bg-[#3366FF]/90"
                  onClick={handleAccept}
                  disabled={acting}
                >
                  {acting ? "Working…" : "Accept"}
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
          ) : null}

          {/* Sender view hint (no actions yet) */}
          {isSender && !trade.declined && !trade.posterConfirm ? (
            <div className="rounded-md border p-3 text-sm text-muted-foreground">
              Waiting for the other user to respond.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

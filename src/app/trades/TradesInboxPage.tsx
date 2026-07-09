import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { ArrowLeftRight, Mail } from "lucide-react";

import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/contexts/auth.context";
import { Navbar } from "@/components/shared/Navbar";
import { PageTransition } from "@/components/shared/PageTransition";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getConversationId } from "@/lib/messages/getConversationId";
import type { TradeDocument } from "@/types";

type UserSnap = { displayName: string; photoURL?: string };

// ─── TradeRow ─────────────────────────────────────────────────────────────────

type TradeRowProps = {
  t: TradeDocument & { id: string };
  mode: "sent" | "received";
  userProfiles: Record<string, UserSnap>;
  onNavigateToTrade: (id: string) => void;
  onNavigateToProfile: (userId: string) => void;
  onOpenConversation: (otherId: string, otherUser: UserSnap) => void;
};

function TradeRow({
  t,
  mode,
  userProfiles,
  onNavigateToTrade,
  onNavigateToProfile,
  onOpenConversation,
}: TradeRowProps) {
  const otherId = mode === "sent" ? t.toUserId : t.fromUserId;
  const otherUser = userProfiles[otherId ?? ""];
  const otherName = otherUser?.displayName ?? "Trade Partner";
  const otherPhoto = otherUser?.photoURL;

  const yourImages = (t.yourItems ?? []).map((i) => i.imageUrl).filter((u): u is string => !!u);
  const theirImages = (t.theirItems ?? []).map((i) => i.imageUrl).filter((u): u is string => !!u);
  const hasImages = yourImages.length > 0 || theirImages.length > 0;

  const statusBadge = (() => {
    if (t.status === "declined")
      return { text: "Declined", cls: "bg-muted text-muted-foreground" };
    if (t.status === "completed")
      return { text: "Completed", cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" };
    if (t.status === "failed")
      return { text: "Failed", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" };
    if (t.status === "countered")
      return { text: "Countered", cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400" };
    if (t.status === "processing" || t.status === "both_confirmed")
      return { text: "Confirmed", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" };
    if (mode === "received" && !t.receiverConfirmed)
      return { text: "Action needed", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400" };
    return { text: t.receiverConfirmed ? "Accepted" : "Pending", cls: "bg-muted text-muted-foreground" };
  })();

  const yourCount = t.yourItems?.length ?? 0;
  const theirCount = t.theirItems?.length ?? 0;
  const cashParts = [
    t.addCash ? `+$${t.addCash}` : "",
    t.askCash ? `+$${t.askCash}` : "",
  ].filter(Boolean).join(" / ");

  const MAX_SHOWN = 3;

  const initials = otherName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");

  return (
    <div className="rounded-2xl bg-card border border-border shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_28px_rgba(0,0,0,0.11)] hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        className="w-full text-left p-4 cursor-pointer"
        onClick={() => onNavigateToTrade(t.id)}
        onKeyDown={(e) => e.key === "Enter" && onNavigateToTrade(t.id)}
      >
        {/* Header row: avatar · name · status · mail */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (otherId) onNavigateToProfile(otherId);
            }}
            className="shrink-0"
          >
            <Avatar className="h-11 w-11 ring-2 ring-border">
              <AvatarImage src={otherPhoto} alt={otherName} className="object-cover" />
              <AvatarFallback className="text-sm font-semibold bg-gradient-to-br from-[#33FF99]/60 to-[#3366FF]/60 text-foreground">
                {initials || "?"}
              </AvatarFallback>
            </Avatar>
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (otherId) onNavigateToProfile(otherId);
                }}
                className="text-sm font-semibold text-foreground hover:text-[#3366FF] transition-colors"
              >
                {otherName}
              </button>
              <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBadge.cls}`}>
                {statusBadge.text}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {yourCount + theirCount} sneaker{yourCount + theirCount !== 1 ? "s" : ""}
              {cashParts ? ` · ${cashParts}` : ""}
            </div>
          </div>

          {/* Mail — open conversation */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (otherId && otherUser) onOpenConversation(otherId, otherUser);
            }}
            className="shrink-0 p-2 rounded-full hover:bg-accent transition-colors text-muted-foreground"
            title="Message"
          >
            <Mail className="w-4 h-4" />
          </button>
        </div>

        {/* Sneaker images — split by side with trade icon between */}
        {hasImages && (
          <div className="mt-3 flex items-center gap-2">
            {/* Your side (right-aligned so both sides meet at the icon) */}
            <div className="flex flex-1 justify-end gap-1.5">
              {yourImages.slice(0, MAX_SHOWN).map((url, idx) => (
                <div
                  key={idx}
                  className="shrink-0 h-14 w-14 rounded-xl bg-gray-50 dark:bg-muted/60 overflow-hidden border border-border"
                >
                  <img src={url} alt="" className="w-full h-full object-contain p-1" loading="lazy" />
                </div>
              ))}
              {yourImages.length > MAX_SHOWN && (
                <div className="shrink-0 h-14 w-14 rounded-xl bg-muted border border-border flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                  +{yourImages.length - MAX_SHOWN}
                </div>
              )}
              {yourImages.length === 0 && (
                <div className="h-14 w-14 rounded-xl border border-dashed border-border flex items-center justify-center text-[10px] text-muted-foreground">
                  —
                </div>
              )}
            </div>

            {/* Trade icon */}
            <div className="shrink-0 h-7 w-7 rounded-full bg-muted flex items-center justify-center">
              <ArrowLeftRight className="w-3 h-3 text-muted-foreground" />
            </div>

            {/* Their side (left-aligned) */}
            <div className="flex flex-1 gap-1.5">
              {theirImages.slice(0, MAX_SHOWN).map((url, idx) => (
                <div
                  key={idx}
                  className="shrink-0 h-14 w-14 rounded-xl bg-gray-50 dark:bg-muted/60 overflow-hidden border border-border"
                >
                  <img src={url} alt="" className="w-full h-full object-contain p-1" loading="lazy" />
                </div>
              ))}
              {theirImages.length > MAX_SHOWN && (
                <div className="shrink-0 h-14 w-14 rounded-xl bg-muted border border-border flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                  +{theirImages.length - MAX_SHOWN}
                </div>
              )}
              {theirImages.length === 0 && (
                <div className="h-14 w-14 rounded-xl border border-dashed border-border flex items-center justify-center text-[10px] text-muted-foreground">
                  —
                </div>
              )}
            </div>
          </div>
        )}
        {t.status === "countered" && t.counteredByTradeId && (
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">A counter offer was sent</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateToTrade(t.counteredByTradeId!);
              }}
              className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline"
            >
              View counter offer →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export const TradesInboxPage = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [sent, setSent] = useState<(TradeDocument & { id: string })[]>([]);
  const [received, setReceived] = useState<(TradeDocument & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [userProfiles, setUserProfiles] = useState<Record<string, UserSnap>>({});

  const fetchProfiles = async (
    trades: (TradeDocument & { id: string })[],
    uid: string
  ) => {
    const ids = new Set<string>();
    for (const t of trades) {
      const otherId = t.fromUserId === uid ? t.toUserId : t.fromUserId;
      if (otherId) ids.add(otherId);
    }
    if (ids.size === 0) return;

    const snaps = await Promise.all([...ids].map((id) => getDoc(doc(db, "users", id))));
    const map: Record<string, UserSnap> = {};
    for (const snap of snaps) {
      if (snap.exists()) {
        const d = snap.data();
        map[snap.id] = { displayName: d.displayName ?? "User", photoURL: d.photoURL };
      }
    }
    setUserProfiles((prev) => ({ ...prev, ...map }));
  };

  useEffect(() => {
    if (!currentUser?.uid) return;
    const uid = currentUser.uid;
    setLoading(true);

    const tradesRef = collection(db, "trades");
    // Closures track latest state from both listeners so fetchProfiles always gets the full picture
    let latestSent: (TradeDocument & { id: string })[] = [];
    let latestReceived: (TradeDocument & { id: string })[] = [];

    const qSent = query(
      tradesRef,
      where("fromUserId", "==", uid),
      orderBy("createdAt", "desc")
    );
    const qReceived = query(
      tradesRef,
      where("toUserId", "==", uid),
      orderBy("createdAt", "desc")
    );

    const unsubSent = onSnapshot(
      qSent,
      (snap) => {
        latestSent = snap.docs.map((d) => ({ id: d.id, ...(d.data() as TradeDocument) }));
        setSent(latestSent);
        setLoading(false);
        fetchProfiles([...latestSent, ...latestReceived], uid);
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
        latestReceived = snap.docs.map((d) => ({ id: d.id, ...(d.data() as TradeDocument) }));
        setReceived(latestReceived);
        setLoading(false);
        fetchProfiles([...latestSent, ...latestReceived], uid);
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

  const hasAny = sent.length + received.length > 0;

  const handleOpenConversation = (otherId: string, otherUser: UserSnap) => {
    const convId = getConversationId(currentUser!.uid, otherId);
    navigate(`/messages/${convId}`, {
      state: { otherUserId: otherId, otherUser },
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <PageTransition>
        <main className="pt-32 md:pt-20 pb-10 px-4 mx-auto max-w-2xl lg:max-w-3xl">
          <h1 className="text-2xl font-bold text-foreground mb-6">Trades</h1>

          {loading && !hasAny && (
            <div className="text-sm text-muted-foreground">Loading trades…</div>
          )}

          {!loading && !hasAny && (
            <div className="rounded-2xl border border-border bg-card p-10 text-center">
              <div className="text-sm text-muted-foreground">No trades yet.</div>
            </div>
          )}

          <div className="space-y-8">
            {received.length > 0 && (
              <section className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Received
                </div>
                <div className="space-y-3">
                  {received.map((t) => (
                    <TradeRow
                      key={t.id}
                      t={t}
                      mode="received"
                      userProfiles={userProfiles}
                      onNavigateToTrade={(id) => navigate(`/trades/${id}`)}
                      onNavigateToProfile={(userId) => navigate(`/profile/${userId}`)}
                      onOpenConversation={handleOpenConversation}
                    />
                  ))}
                </div>
              </section>
            )}

            {sent.length > 0 && (
              <section className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Sent
                </div>
                <div className="space-y-3">
                  {sent.map((t) => (
                    <TradeRow
                      key={t.id}
                      t={t}
                      mode="sent"
                      userProfiles={userProfiles}
                      onNavigateToTrade={(id) => navigate(`/trades/${id}`)}
                      onNavigateToProfile={(userId) => navigate(`/profile/${userId}`)}
                      onOpenConversation={handleOpenConversation}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        </main>
      </PageTransition>
    </div>
  );
};

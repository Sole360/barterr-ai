import { useEffect, useMemo, useState } from "react";
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
import { ArrowLeftRight, Mail, CornerDownRight } from "lucide-react";

import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/contexts/auth.context";
import { Navbar } from "@/components/shared/Navbar";
import { PageTransition } from "@/components/shared/PageTransition";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getConversationId } from "@/lib/messages/getConversationId";
import type { TradeDocument } from "@/types";

type UserSnap = { displayName: string; photoURL?: string };
type Tab = "received" | "sent";

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
        {/* Header row */}
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

        {/* Sneaker images */}
        {hasImages && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex flex-1 justify-end gap-1.5">
              {yourImages.slice(0, MAX_SHOWN).map((url, idx) => (
                <div key={idx} className="shrink-0 h-14 w-14 rounded-xl bg-white overflow-hidden border border-border">
                  <img src={url} alt="" className="w-full h-full object-contain p-1" loading="lazy" />
                </div>
              ))}
              {yourImages.length > MAX_SHOWN && (
                <div className="shrink-0 h-14 w-14 rounded-xl bg-muted border border-border flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                  +{yourImages.length - MAX_SHOWN}
                </div>
              )}
              {yourImages.length === 0 && (
                <div className="h-14 w-14 rounded-xl border border-dashed border-border flex items-center justify-center text-[10px] text-muted-foreground">—</div>
              )}
            </div>

            <div className="shrink-0 h-7 w-7 rounded-full bg-muted flex items-center justify-center">
              <ArrowLeftRight className="w-3 h-3 text-muted-foreground" />
            </div>

            <div className="flex flex-1 gap-1.5">
              {theirImages.slice(0, MAX_SHOWN).map((url, idx) => (
                <div key={idx} className="shrink-0 h-14 w-14 rounded-xl bg-white overflow-hidden border border-border">
                  <img src={url} alt="" className="w-full h-full object-contain p-1" loading="lazy" />
                </div>
              ))}
              {theirImages.length > MAX_SHOWN && (
                <div className="shrink-0 h-14 w-14 rounded-xl bg-muted border border-border flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                  +{theirImages.length - MAX_SHOWN}
                </div>
              )}
              {theirImages.length === 0 && (
                <div className="h-14 w-14 rounded-xl border border-dashed border-border flex items-center justify-center text-[10px] text-muted-foreground">—</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CounterChildRow ──────────────────────────────────────────────────────────

type CounterChildRowProps = {
  t: TradeDocument & { id: string };
  mode: "sent" | "received";
  userProfiles: Record<string, UserSnap>;
  onNavigateToTrade: (id: string) => void;
};

function CounterChildRow({ t, mode, userProfiles, onNavigateToTrade }: CounterChildRowProps) {
  const otherId = mode === "sent" ? t.toUserId : t.fromUserId;
  const otherUser = userProfiles[otherId ?? ""];
  const otherName = otherUser?.displayName ?? "Trade Partner";

  const yourImages = (t.yourItems ?? []).map((i) => i.imageUrl).filter((u): u is string => !!u);
  const theirImages = (t.theirItems ?? []).map((i) => i.imageUrl).filter((u): u is string => !!u);
  const hasImages = yourImages.length > 0 || theirImages.length > 0;

  const statusBadge = (() => {
    if (t.status === "declined")
      return { text: "Declined", cls: "bg-muted text-muted-foreground" };
    if (t.status === "completed")
      return { text: "Completed", cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" };
    if (t.status === "processing" || t.status === "both_confirmed")
      return { text: "Confirmed", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" };
    if (mode === "received" && !t.receiverConfirmed)
      return { text: "Action needed", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400" };
    return { text: t.receiverConfirmed ? "Accepted" : "Pending", cls: "bg-muted text-muted-foreground" };
  })();

  const yourCount = t.yourItems?.length ?? 0;
  const theirCount = t.theirItems?.length ?? 0;
  const MAX_SHOWN = 3;
  const sentByMe = mode === "sent";

  return (
    <div className="flex gap-2 mt-1 pl-5 md:pl-7">
      {/* Vertical + corner connector */}
      <div className="flex flex-col items-center shrink-0 pt-1">
        <div className="w-px flex-1 bg-purple-300 dark:bg-purple-700 min-h-[12px]" />
        <CornerDownRight className="w-3.5 h-3.5 text-purple-400 dark:text-purple-500 shrink-0" />
      </div>

      {/* Counter card — same bg-card styling as parent */}
      <div className="flex-1 min-w-0 mb-1">
        <button
          type="button"
          onClick={() => onNavigateToTrade(t.id)}
          className="w-full text-left rounded-2xl border border-border bg-card hover:shadow-[0_4px_16px_rgba(0,0,0,0.09)] hover:-translate-y-0.5 transition-all duration-200 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.05)]"
        >
          {/* Label + status row */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
              {sentByMe ? "Your counter offer" : "Counter offer received"}
            </span>
            <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBadge.cls}`}>
              {statusBadge.text}
            </span>
          </div>

          {/* Sneaker images — same size as parent (h-14 w-14) */}
          {hasImages && (
            <div className="flex items-center gap-2">
              <div className="flex flex-1 justify-end gap-1.5">
                {yourImages.slice(0, MAX_SHOWN).map((url, idx) => (
                  <div key={idx} className="shrink-0 h-14 w-14 rounded-xl bg-white overflow-hidden border border-border">
                    <img src={url} alt="" className="w-full h-full object-contain p-1" loading="lazy" />
                  </div>
                ))}
                {yourImages.length > MAX_SHOWN && (
                  <div className="shrink-0 h-14 w-14 rounded-xl bg-muted border border-border flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                    +{yourImages.length - MAX_SHOWN}
                  </div>
                )}
                {yourImages.length === 0 && (
                  <div className="h-14 w-14 rounded-xl border border-dashed border-border flex items-center justify-center text-[10px] text-muted-foreground">—</div>
                )}
              </div>
              <div className="shrink-0 h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                <ArrowLeftRight className="w-3 h-3 text-muted-foreground" />
              </div>
              <div className="flex flex-1 gap-1.5">
                {theirImages.slice(0, MAX_SHOWN).map((url, idx) => (
                  <div key={idx} className="shrink-0 h-14 w-14 rounded-xl bg-white overflow-hidden border border-border">
                    <img src={url} alt="" className="w-full h-full object-contain p-1" loading="lazy" />
                  </div>
                ))}
                {theirImages.length > MAX_SHOWN && (
                  <div className="shrink-0 h-14 w-14 rounded-xl bg-muted border border-border flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                    +{theirImages.length - MAX_SHOWN}
                  </div>
                )}
                {theirImages.length === 0 && (
                  <div className="h-14 w-14 rounded-xl border border-dashed border-border flex items-center justify-center text-[10px] text-muted-foreground">—</div>
                )}
              </div>
            </div>
          )}

          {/* Sub-label */}
          <div className="mt-2 text-xs text-muted-foreground">
            {yourCount + theirCount} sneaker{yourCount + theirCount !== 1 ? "s" : ""}
            {t.addCash ? ` · +$${t.addCash}` : ""}
            {t.askCash ? ` · +$${t.askCash}` : ""}
            {` · with ${otherName}`}
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── Counter chain helper ─────────────────────────────────────────────────────

/** Walk counteredByTradeId pointers to collect every counter in order. */
function buildCounterChain(
  startId: string | undefined,
  allTradesMap: Map<string, TradeDocument & { id: string }>,
  depth = 0
): (TradeDocument & { id: string })[] {
  if (!startId || depth > 10) return [];
  const trade = allTradesMap.get(startId);
  if (!trade) return [];
  return [trade, ...buildCounterChain(trade.counteredByTradeId, allTradesMap, depth + 1)];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export const TradesInboxPage = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>("received");
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
    let latestSent: (TradeDocument & { id: string })[] = [];
    let latestReceived: (TradeDocument & { id: string })[] = [];

    const qSent = query(tradesRef, where("fromUserId", "==", uid), orderBy("createdAt", "desc"));
    const qReceived = query(tradesRef, where("toUserId", "==", uid), orderBy("createdAt", "desc"));

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

  // Build a unified map for counter trade lookups
  const allTradesMap = useMemo(() => {
    const map = new Map<string, TradeDocument & { id: string }>();
    for (const t of [...sent, ...received]) map.set(t.id, t);
    return map;
  }, [sent, received]);

  // Trades whose IDs appear as counter trades (exclude from top-level)
  const counterTradeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of [...sent, ...received]) {
      if (t.counterOfTradeId) ids.add(t.id);
    }
    return ids;
  }, [sent, received]);

  // Set of sent trade IDs — used to determine counter mode
  const sentIds = useMemo(() => new Set(sent.map((t) => t.id)), [sent]);

  // Top-level lists (counters are shown nested, not as standalone rows)
  const receivedTopLevel = useMemo(
    () => received.filter((t) => !counterTradeIds.has(t.id)),
    [received, counterTradeIds]
  );
  const sentTopLevel = useMemo(
    () => sent.filter((t) => !counterTradeIds.has(t.id)),
    [sent, counterTradeIds]
  );

  const activeList = activeTab === "received" ? receivedTopLevel : sentTopLevel;
  const activeMode = activeTab;

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
        <main className="pt-20 pb-24 md:pb-10 px-4 mx-auto max-w-2xl lg:max-w-3xl">
          <h1 className="text-2xl font-bold text-foreground mb-5">Trades</h1>

          {/* ── Tabs ── */}
          <div className="flex gap-2 mb-5 p-1 rounded-xl bg-muted">
            {(["received", "sent"] as Tab[]).map((tab) => {
              const count = tab === "received" ? receivedTopLevel.length : sentTopLevel.length;
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all duration-150 ${
                    isActive
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "received" ? "Received" : "Sent"}
                  {count > 0 && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none ${
                        isActive
                          ? "bg-[#3366FF] text-white"
                          : "bg-muted-foreground/20 text-muted-foreground"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Content ── */}
          {loading && !hasAny && (
            <div className="text-sm text-muted-foreground">Loading trades…</div>
          )}

          {!loading && activeList.length === 0 && (
            <div className="rounded-2xl border border-border bg-card p-10 text-center">
              <div className="text-sm text-muted-foreground">
                No {activeTab} trades yet.
              </div>
            </div>
          )}

          <div className="space-y-3">
            {activeList.map((t) => {
              const counterChain = buildCounterChain(t.counteredByTradeId, allTradesMap);

              return (
                <div key={t.id}>
                  <TradeRow
                    t={t}
                    mode={activeMode}
                    userProfiles={userProfiles}
                    onNavigateToTrade={(id) => navigate(`/trades/${id}`)}
                    onNavigateToProfile={(userId) => navigate(`/profile/${userId}`)}
                    onOpenConversation={handleOpenConversation}
                  />
                  {counterChain.map((counter) => (
                    <CounterChildRow
                      key={counter.id}
                      t={counter}
                      mode={sentIds.has(counter.id) ? "sent" : "received"}
                      userProfiles={userProfiles}
                      onNavigateToTrade={(id) => navigate(`/trades/${id}`)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </main>
      </PageTransition>
    </div>
  );
};

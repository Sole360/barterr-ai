import { useEffect, useState } from "react";
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { ArrowLeftRight } from "lucide-react";
import { db } from "@/lib/firebase/config";
import type { TradeDocument, TradeStatus } from "@/types";

type TradeRow = TradeDocument & { id: string };

const STATUS_COLOR: Record<TradeStatus, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  both_confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  processing: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  declined: "bg-muted text-muted-foreground",
};

function relativeTime(ts: { toDate: () => Date } | null): string {
  if (!ts) return "";
  const d = ts.toDate();
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatCents(cents: number): string {
  if (!cents || cents <= 0) return "";
  return `$${(cents / 100).toFixed(0)}`;
}

function Thumb({ url, name }: { url?: string; name?: string }) {
  return (
    <div className="w-12 h-12 shrink-0 rounded-lg bg-white border border-border/50 overflow-hidden shadow-sm">
      {url ? (
        <img src={url} alt={name ?? ""} className="w-full h-full object-contain p-0.5" />
      ) : (
        <div className="w-full h-full bg-muted" />
      )}
    </div>
  );
}

export const AdminTradesPage = () => {
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const q = query(collection(db, "trades"), orderBy("createdAt", "desc"), limit(100));
    const unsub = onSnapshot(q, async (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TradeRow));
      setTrades(rows);
      setLoading(false);

      // Fetch display names for any UIDs we don't have yet
      const uids = new Set<string>();
      rows.forEach((t) => { uids.add(t.fromUserId); uids.add(t.toUserId); });

      setUserNames((prev) => {
        const missing = [...uids].filter((uid) => !prev[uid]);
        if (missing.length === 0) return prev;

        Promise.all(
          missing.map((uid) =>
            getDoc(doc(db, "users", uid)).then((s) => ({
              uid,
              name: s.data()?.displayName ?? uid.slice(0, 8) + "…",
            }))
          )
        ).then((results) => {
          setUserNames((p) => {
            const next = { ...p };
            results.forEach(({ uid, name }) => { next[uid] = name; });
            return next;
          });
        });

        return prev;
      });
    });
    return unsub;
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-foreground mb-5">All Trades</h1>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : trades.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <ArrowLeftRight className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <div className="text-sm text-muted-foreground">No trades yet</div>
        </div>
      ) : (
        <div className="space-y-3">
          {trades.map((t) => {
            const fromItems = (t.yourItems ?? []).slice(0, 3);
            const toItems = (t.theirItems ?? []).slice(0, 3);
            const totalItems = (t.yourItems?.length ?? 0) + (t.theirItems?.length ?? 0);
            const fromName = userNames[t.fromUserId] ?? t.fromUserId.slice(0, 8) + "…";
            const toName = userNames[t.toUserId] ?? t.toUserId.slice(0, 8) + "…";
            const revenueCents = (t.senderServiceFeeCents ?? 0) + (t.receiverServiceFeeCents ?? 0);
            const revenue = formatCents(revenueCents);
            const likelihood = t.likelihood != null ? Math.round(t.likelihood * 100) : null;

            return (
              <div
                key={t.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
              >
                {/* User name labels */}
                <div className="flex items-center gap-3 mb-1.5">
                  <div className="flex-1 text-right text-[11px] font-semibold text-foreground truncate">{fromName}</div>
                  <div className="shrink-0 w-9" />
                  <div className="flex-1 text-left text-[11px] font-semibold text-foreground truncate">{toName}</div>
                </div>

                {/* Thumbnails row */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-row-reverse gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
                      {[...fromItems].reverse().map((item, i) => (
                        <Thumb key={i} url={item.imageUrl} name={item.name} />
                      ))}
                      {fromItems.length === 0 && <Thumb />}
                    </div>
                  </div>
                  <div className="shrink-0 h-9 w-9 rounded-full bg-muted border border-border flex items-center justify-center shadow-sm">
                    <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
                      {toItems.map((item, i) => (
                        <Thumb key={i} url={item.imageUrl} name={item.title} />
                      ))}
                      {toItems.length === 0 && <Thumb />}
                    </div>
                  </div>
                </div>

                {/* Meta row */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                    <span>{totalItems} sneaker{totalItems !== 1 ? "s" : ""}</span>
                    <span className="text-border">·</span>
                    <span>{relativeTime(t.createdAt as any)}</span>
                    {likelihood !== null && (
                      <>
                        <span className="text-border">·</span>
                        <span className={likelihood >= 70 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : ""}>
                          {likelihood}% likelihood
                        </span>
                      </>
                    )}
                    {revenue && (
                      <>
                        <span className="text-border">·</span>
                        <span className="text-[#3366FF] font-semibold">{revenue} revenue</span>
                      </>
                    )}
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${STATUS_COLOR[t.status]}`}>
                    {t.status.replace("_", " ")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

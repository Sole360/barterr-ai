import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
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

export const AdminTradesPage = () => {
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "trades"), orderBy("createdAt", "desc"), limit(100));
    const unsub = onSnapshot(q, (snap) => {
      setTrades(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TradeRow)));
      setLoading(false);
    });
    return unsub;
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-foreground mb-5">All Trades</h1>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : trades.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <ArrowLeftRight className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <div className="text-sm text-muted-foreground">No trades yet</div>
        </div>
      ) : (
        <div className="space-y-2">
          {trades.map((t) => (
            <div
              key={t.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono truncate">
                    <span className="truncate">{t.fromUserId.slice(0, 8)}…</span>
                    <ArrowLeftRight className="w-3 h-3 shrink-0" />
                    <span className="truncate">{t.toUserId.slice(0, 8)}…</span>
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {relativeTime(t.createdAt as any)}
                    {" · "}
                    {(t.yourItems?.length ?? 0) + (t.theirItems?.length ?? 0)} sneakers
                  </div>
                </div>
                <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${STATUS_COLOR[t.status]}`}>
                  {t.status.replace("_", " ")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

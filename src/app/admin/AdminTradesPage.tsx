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

            return (
              <div
                key={t.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
              >
                {/* Trade participants row */}
                <div className="flex items-center gap-3 mb-3">
                  {/* From-user thumbnails (radiate right toward icon) */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-row-reverse gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
                      {[...fromItems].reverse().map((item, i) => (
                        <Thumb key={i} url={item.imageUrl} name={item.name} />
                      ))}
                      {fromItems.length === 0 && <Thumb />}
                    </div>
                  </div>

                  {/* Trade icon */}
                  <div className="shrink-0 h-9 w-9 rounded-full bg-muted border border-border flex items-center justify-center shadow-sm">
                    <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
                  </div>

                  {/* To-user thumbnails (radiate left toward icon) */}
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
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 text-[10px] text-muted-foreground font-mono flex items-center gap-1.5 truncate">
                    <span className="truncate">{t.fromUserId.slice(0, 8)}…</span>
                    <span className="text-border">→</span>
                    <span className="truncate">{t.toUserId.slice(0, 8)}…</span>
                    <span className="text-border">·</span>
                    <span>{totalItems} sneaker{totalItems !== 1 ? "s" : ""}</span>
                    <span className="text-border">·</span>
                    <span>{relativeTime(t.createdAt as any)}</span>
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

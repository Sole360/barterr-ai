import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { ShieldAlert, CheckCheck, AlertTriangle, Ban } from "lucide-react";
import { db } from "@/lib/firebase/config";
import { useToast } from "@/hooks/use-toast";

type FlaggedAttempt = {
  id: string;
  senderId: string;
  conversationId: string;
  participants: string[];
  attemptedText: string;
  detectedAt: { toDate: () => Date } | null;
  resolved?: boolean;
  resolution?: string;
};

function relativeTime(ts: { toDate: () => Date } | null): string {
  if (!ts) return "";
  const diff = Date.now() - ts.toDate().getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return ts.toDate().toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const FlaggedMessagesPage = () => {
  const { toast } = useToast();
  const [items, setItems] = useState<FlaggedAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    const q = showResolved
      ? query(collection(db, "flaggedAttempts"), orderBy("detectedAt", "desc"))
      : query(collection(db, "flaggedAttempts"), where("resolved", "==", false), orderBy("detectedAt", "desc"));

    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FlaggedAttempt)));
      setLoading(false);
    });
    return unsub;
  }, [showResolved]);

  const resolve = async (id: string, resolution: "dismissed" | "warned" | "banned") => {
    setActing(id);
    try {
      const fns = getFunctions(undefined, "us-central1");
      await httpsCallable(fns, "resolveFlaggedAttempt")({ attemptId: id, resolution });
      toast({ title: resolution === "dismissed" ? "Dismissed" : resolution === "warned" ? "User warned" : "User banned" });
    } catch {
      toast({ title: "Error", description: "Action failed", variant: "destructive" });
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-foreground">Flagged Messages</h1>
        <button
          type="button"
          onClick={() => setShowResolved((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showResolved ? "Hide resolved" : "Show resolved"}
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <ShieldAlert className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <div className="text-sm text-muted-foreground">No flagged messages</div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={`rounded-2xl border bg-card p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] ${
                item.resolved ? "border-border opacity-60" : "border-red-200 dark:border-red-800/50"
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-foreground truncate">
                    Sender: <span className="font-mono text-[10px] text-muted-foreground">{item.senderId}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {relativeTime(item.detectedAt)}
                    {item.resolved && (
                      <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                        · Resolved: {item.resolution}
                      </span>
                    )}
                  </div>
                </div>
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              </div>

              {/* Blocked text */}
              <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40 px-3 py-2 mb-3">
                <p className="text-xs text-red-800 dark:text-red-300 break-words leading-relaxed">
                  "{item.attemptedText}"
                </p>
              </div>

              {/* Actions */}
              {!item.resolved && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!!acting}
                    onClick={() => resolve(item.id, "dismissed")}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Dismiss
                  </button>
                  <button
                    type="button"
                    disabled={!!acting}
                    onClick={() => resolve(item.id, "warned")}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-amber-300 dark:border-amber-700 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-40"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Warn
                  </button>
                  <button
                    type="button"
                    disabled={!!acting}
                    onClick={() => resolve(item.id, "banned")}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-red-300 dark:border-red-700 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    Ban
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { Bug, CheckCheck, Lightbulb, MessageCircle, MessageSquareText } from "lucide-react";
import { db } from "@/lib/firebase/config";
import { useToast } from "@/hooks/use-toast";

type FeedbackStatus = "new" | "reviewed" | "resolved";

type FeedbackItem = {
  id: string;
  userId: string;
  userName: string;
  email: string;
  type: "bug" | "feature" | "other";
  page: string | null;
  pageIsCurrent: boolean;
  message: string;
  screenshots: string[];
  status: FeedbackStatus;
  userAgent?: string;
  createdAt: { toDate: () => Date } | null;
};

const TYPE_META = {
  bug: { label: "Bug", icon: Bug, cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  feature: { label: "Feature", icon: Lightbulb, cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  other: { label: "Other", icon: MessageCircle, cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
} as const;

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

export const FeedbackPage = () => {
  const { toast } = useToast();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "all">("new");
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "feedback"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeedbackItem)));
        setLoading(false);
      },
      (err) => {
        console.error("Feedback listener error:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const setStatus = async (id: string, status: FeedbackStatus) => {
    setActing(id);
    try {
      await updateDoc(doc(db, "feedback", id), { status });
      toast({ title: status === "resolved" ? "Marked resolved" : "Marked reviewed" });
    } catch {
      toast({ title: "Error", description: "Failed to update", variant: "destructive" });
    } finally {
      setActing(null);
    }
  };

  const visible =
    statusFilter === "all" ? items : items.filter((i) => (i.status ?? "new") === statusFilter);

  const counts = {
    new: items.filter((i) => (i.status ?? "new") === "new").length,
    reviewed: items.filter((i) => i.status === "reviewed").length,
    resolved: items.filter((i) => i.status === "resolved").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <MessageSquareText className="w-5 h-5 text-[#3366FF]" />
        <h1 className="text-xl font-bold text-foreground">User Feedback</h1>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {(["new", "reviewed", "resolved", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === s
                ? "bg-[#3366FF] text-white"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            {s !== "all" && (
              <span className="ml-1.5 opacity-70">{counts[s]}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground text-sm">
          No {statusFilter === "all" ? "" : statusFilter} feedback yet.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((item) => {
            const meta = TYPE_META[item.type] ?? TYPE_META.other;
            const Icon = meta.icon;
            return (
              <div key={item.id} className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.cls}`}>
                      <Icon className="w-3 h-3" />
                      {meta.label}
                    </span>
                    {item.page && (
                      <span className="text-xs font-mono bg-muted rounded px-2 py-1 text-muted-foreground">
                        {item.page}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{relativeTime(item.createdAt)}</span>
                  </div>
                  <div className="flex gap-2">
                    {(item.status ?? "new") === "new" && (
                      <button
                        disabled={acting === item.id}
                        onClick={() => setStatus(item.id, "reviewed")}
                        className="text-xs font-medium rounded-lg border border-border px-3 py-1.5 hover:bg-accent transition-colors"
                      >
                        Mark reviewed
                      </button>
                    )}
                    {item.status !== "resolved" && (
                      <button
                        disabled={acting === item.id}
                        onClick={() => setStatus(item.id, "resolved")}
                        className="text-xs font-medium rounded-lg bg-emerald-600 text-white px-3 py-1.5 hover:bg-emerald-700 transition-colors inline-flex items-center gap-1"
                      >
                        <CheckCheck className="w-3 h-3" />
                        Resolve
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-sm text-foreground whitespace-pre-wrap">{item.message}</p>

                {item.screenshots?.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {item.screenshots.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        <img
                          src={url}
                          alt={`Screenshot ${i + 1}`}
                          className="w-24 h-24 object-cover rounded-lg border border-border hover:opacity-80 transition-opacity"
                        />
                      </a>
                    ))}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  {item.userName || "Unknown"} · {item.email}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

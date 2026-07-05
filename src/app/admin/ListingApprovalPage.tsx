import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Check, X, MessageSquare, PackageSearch } from "lucide-react";
import { db } from "@/lib/firebase/config";
import { useToast } from "@/hooks/use-toast";

type ListingDoc = {
  id: string;
  title: string;
  brand: string;
  productImageUrl?: string;
  userId: string;
  status?: string;
  createdAt: { toDate: () => Date } | null;
  reviewFeedback?: string;
};

const STATUS_FILTERS = ["pending_review", "approved", "changes_requested", "rejected"] as const;

export const ListingApprovalPage = () => {
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("pending_review");
  const [items, setItems] = useState<ListingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");

  useEffect(() => {
    const q = query(
      collection(db, "posts"),
      where("status", "==", filter),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ListingDoc)));
      setLoading(false);
    });
    return unsub;
  }, [filter]);

  const review = async (postId: string, action: "approve" | "reject" | "request_changes", feedback?: string) => {
    setActing(postId);
    try {
      const fns = getFunctions(undefined, "us-central1");
      await httpsCallable(fns, "reviewListing")({ postId, action, feedback });
      toast({ title: action === "approve" ? "Listing approved" : action === "reject" ? "Listing rejected" : "Changes requested" });
      setFeedbackId(null);
      setFeedbackText("");
    } catch {
      toast({ title: "Error", description: "Action failed", variant: "destructive" });
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-foreground mb-5">Listing Approval</h1>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-5">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === s
                ? "bg-[#3366FF] text-white"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <PackageSearch className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <div className="text-sm text-muted-foreground">No listings in this queue</div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-border bg-card p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
              <div className="flex gap-3">
                <div className="w-16 h-16 shrink-0 rounded-xl bg-white border border-border/50 overflow-hidden">
                  {item.productImageUrl && (
                    <img src={item.productImageUrl} alt={item.title} className="w-full h-full object-contain p-1" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold text-[#3366FF] uppercase tracking-widest">{item.brand}</div>
                  <div className="text-sm font-semibold text-foreground line-clamp-1 mt-0.5">{item.title}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">{item.userId}</div>
                </div>
              </div>

              {item.reviewFeedback && (
                <div className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Feedback: {item.reviewFeedback}
                </div>
              )}

              {/* Feedback input */}
              {feedbackId === item.id && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Describe what needs to change…"
                    rows={3}
                    className="w-full text-sm rounded-xl border border-border bg-background px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#3366FF]/40"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => review(item.id, "request_changes", feedbackText)}
                      disabled={!feedbackText.trim() || !!acting}
                      className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors disabled:opacity-40"
                    >
                      Send Request
                    </button>
                    <button
                      type="button"
                      onClick={() => { setFeedbackId(null); setFeedbackText(""); }}
                      className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {filter === "pending_review" && feedbackId !== item.id && (
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    disabled={!!acting}
                    onClick={() => review(item.id, "approve")}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors disabled:opacity-40"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={!!acting}
                    onClick={() => setFeedbackId(item.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 text-xs font-semibold hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-40"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Changes
                  </button>
                  <button
                    type="button"
                    disabled={!!acting}
                    onClick={() => review(item.id, "reject")}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
                  >
                    <X className="w-3.5 h-3.5" />
                    Reject
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

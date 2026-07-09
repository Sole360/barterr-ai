import { useEffect, useState } from "react";
import { collection, doc, getDoc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Check, X, MessageSquare, PackageSearch, ChevronDown, ChevronUp } from "lucide-react";
import { db } from "@/lib/firebase/config";
import { useToast } from "@/hooks/use-toast";

type ListingPhotos = {
  appearance?: string;
  boxLabel?: string;
  insoles?: string;
  boxFrontal?: string;
  insoleStitching?: string;
  dateCode?: string;
};

type ListingDoc = {
  id: string;
  title: string;
  brand: string;
  productImageUrl?: string;
  photos?: ListingPhotos;
  userId: string;
  userName?: string;
  status?: string;
  createdAt: { toDate: () => Date } | null;
  reviewFeedback?: string;
  size?: number;
  condition?: string;
  conditionGrade?: number;
  tradeValue?: number;
  hasBox?: boolean;
  flaws?: string;
};

// Display label → approvalStatus value stored in Firestore
const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: "Pending Review", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Changes Requested", value: "changes_requested" },
  { label: "Rejected", value: "rejected" },
];

const PHOTO_LABELS: { key: keyof ListingPhotos; label: string }[] = [
  { key: "appearance", label: "Appearance" },
  { key: "boxFrontal", label: "Box Frontal" },
  { key: "boxLabel", label: "Box Label" },
  { key: "insoles", label: "Insoles" },
  { key: "insoleStitching", label: "Stitching" },
  { key: "dateCode", label: "Date Code" },
];

function PhotoGallery({ productImageUrl, photos }: { productImageUrl?: string; photos?: ListingPhotos }) {
  const [selected, setSelected] = useState<string | null>(productImageUrl ?? null);

  const allPhotos: { label: string; url: string }[] = [];
  if (productImageUrl) allPhotos.push({ label: "Product", url: productImageUrl });
  for (const { key, label } of PHOTO_LABELS) {
    const url = photos?.[key];
    if (url) allPhotos.push({ label, url });
  }

  if (allPhotos.length === 0) {
    return (
      <div className="w-full aspect-video rounded-xl bg-muted flex items-center justify-center mb-3">
        <span className="text-xs text-muted-foreground">No photos uploaded</span>
      </div>
    );
  }

  const current = allPhotos.find((p) => p.url === selected) ?? allPhotos[0];

  return (
    <div className="mb-4">
      {/* Main preview */}
      <div className="w-full aspect-video rounded-xl bg-muted border border-border/50 overflow-hidden mb-2 flex items-center justify-center">
        <img
          src={current.url}
          alt={current.label}
          className="max-w-full max-h-full object-contain p-2"
        />
      </div>
      <div className="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
        {current.label}
      </div>

      {/* Thumbnails */}
      {allPhotos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {allPhotos.map((p) => (
            <button
              key={p.url}
              type="button"
              onClick={() => setSelected(p.url)}
              className={`shrink-0 w-14 h-14 rounded-lg border-2 overflow-hidden transition-colors bg-muted ${
                selected === p.url ? "border-[#3366FF]" : "border-border/50 hover:border-border"
              }`}
            >
              <img src={p.url} alt={p.label} className="w-full h-full object-contain p-0.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const ListingApprovalPage = () => {
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("pending");
  const [items, setItems] = useState<ListingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});
  const [feedbackState, setFeedbackState] = useState<{ id: string; action: "request_changes" | "reject" } | null>(null);
  const [feedbackText, setFeedbackText] = useState("");

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "listings"),
      where("approvalStatus", "==", filter),
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
      await httpsCallable(fns, "reviewListing")({ listingId: postId, action, feedback });
      toast({
        title:
          action === "approve"
            ? "Listing approved"
            : action === "reject"
            ? "Listing rejected"
            : "Changes requested",
      });
      setFeedbackState(null);
      setFeedbackText("");
      setExpanded(null);
    } catch {
      toast({ title: "Error", description: "Action failed", variant: "destructive" });
    } finally {
      setActing(null);
    }
  };

  const handleExpand = (item: ListingDoc) => {
    const next = expanded === item.id ? null : item.id;
    setExpanded(next);
    if (next && item.userId && !userEmails[item.userId]) {
      getDoc(doc(db, "users", item.userId)).then((snap) => {
        if (snap.exists()) {
          const email = snap.data()?.email as string | undefined;
          if (email) setUserEmails((prev) => ({ ...prev, [item.userId]: email }));
        }
      }).catch(() => {});
    }
  };

  const openFeedback = (id: string, action: "request_changes" | "reject") => {
    setFeedbackState({ id, action });
    setFeedbackText("");
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-foreground mb-5">Listing Approval</h1>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-5">
        {STATUS_FILTERS.map(({ label, value }) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === value
                ? "bg-[#3366FF] text-white"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <PackageSearch className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <div className="text-sm text-muted-foreground">No listings in this queue</div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isExpanded = expanded === item.id;
            const isFeedbackOpen = feedbackState?.id === item.id;

            return (
              <div key={item.id} className="rounded-2xl border border-border bg-card shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
                {/* Header row — always visible */}
                <button
                  type="button"
                  className="w-full flex gap-3 p-4 text-left hover:bg-accent/40 transition-colors"
                  onClick={() => handleExpand(item)}
                >
                  {/* Thumbnail */}
                  <div className="w-14 h-14 shrink-0 rounded-xl bg-muted border border-border/50 overflow-hidden">
                    {item.productImageUrl && (
                      <img
                        src={item.productImageUrl}
                        alt={item.title}
                        className="w-full h-full object-contain p-1"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold text-[#3366FF] uppercase tracking-widest">{item.brand}</div>
                    <div className="text-sm font-semibold text-foreground line-clamp-1 mt-0.5">{item.title}</div>
                    <div className="flex flex-wrap gap-x-2 mt-1 text-[10px] text-muted-foreground">
                      {item.userName && <span className="font-medium text-foreground/70">{item.userName}</span>}
                      {item.size && <span>· Sz {item.size}</span>}
                      {item.condition && <span>· {item.condition}</span>}
                      {item.tradeValue && <span>· ${item.tradeValue}</span>}
                    </div>
                  </div>

                  <div className="shrink-0 self-center text-muted-foreground">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {/* Expanded detail — photos + actions */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border pt-4">
                    <PhotoGallery productImageUrl={item.productImageUrl} photos={item.photos} />

                    {/* Seller info */}
                    <div className="mb-3 rounded-xl bg-muted/60 px-3 py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-foreground">{item.userName ?? "Unknown"}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {userEmails[item.userId] ?? "Loading…"}
                        </div>
                      </div>
                      <a
                        href={`/profile/${item.userId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-semibold text-[#3366FF] hover:underline shrink-0"
                      >
                        View profile →
                      </a>
                    </div>

                    {/* Listing details */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-3">
                      {item.hasBox !== undefined && <span>Box: {item.hasBox ? "Yes" : "No"}</span>}
                      {item.conditionGrade !== undefined && <span>Grade: {item.conditionGrade}/10</span>}
                      {item.flaws && <span>Flaws: {item.flaws}</span>}
                    </div>

                    {/* Prior feedback */}
                    {item.reviewFeedback && (
                      <div className="mb-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                        Previous feedback: {item.reviewFeedback}
                      </div>
                    )}

                    {/* Feedback textarea */}
                    {isFeedbackOpen && (
                      <div className="mb-3 space-y-2">
                        <p className="text-xs font-semibold text-foreground">
                          {feedbackState?.action === "reject" ? "Rejection reason (sent to seller)" : "Requested changes (sent to seller)"}
                        </p>
                        <textarea
                          value={feedbackText}
                          onChange={(e) => setFeedbackText(e.target.value)}
                          placeholder={feedbackState?.action === "reject" ? "Explain why this listing is being rejected…" : "Describe what needs to change…"}
                          rows={3}
                          className="w-full text-sm rounded-xl border border-border bg-background px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#3366FF]/40"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => review(item.id, feedbackState!.action, feedbackText)}
                            disabled={!feedbackText.trim() || !!acting}
                            className={`flex-1 py-2 rounded-xl text-white text-xs font-semibold transition-colors disabled:opacity-40 ${
                              feedbackState?.action === "reject"
                                ? "bg-red-500 hover:bg-red-600"
                                : "bg-amber-500 hover:bg-amber-600"
                            }`}
                          >
                            {feedbackState?.action === "reject" ? "Confirm Rejection" : "Send Request"}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setFeedbackState(null); setFeedbackText(""); }}
                            className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    {filter === "pending" && !isFeedbackOpen && (
                      <div className="flex gap-2">
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
                          onClick={() => openFeedback(item.id, "request_changes")}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 text-xs font-semibold hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-40"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          Changes
                        </button>
                        <button
                          type="button"
                          disabled={!!acting}
                          onClick={() => openFeedback(item.id, "reject")}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
                        >
                          <X className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

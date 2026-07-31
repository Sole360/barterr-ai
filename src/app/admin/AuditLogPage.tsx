import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { format } from "date-fns";

type AuditStatus = "success" | "failure";

interface AuditEntry {
  id: string;
  timestamp: Timestamp | null;
  eventType: string;
  functionName: string;
  actorId: string;
  targetId: string;
  targetType: string;
  status: AuditStatus;
  durationMs: number;
  metadata: Record<string, unknown>;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  "trade.created": "Trade Sent",
  "trade.declined": "Trade Declined",
  "trade.accepted": "Trade Accepted",
  "trade.payment_captured": "Payment Captured",
  "trade.payment_failed": "Payment Failed",
  "trade.payment_retried": "Payment Retried",
  "trade.completed": "Trade Completed",
  "label.inbound_created": "Inbound Label",
  "label.outbound_created": "Outbound Label",
  "auth.sneakers_received": "Sneakers Received",
  "auth.result": "Auth Result",
  "admin.listing_reviewed": "Listing Reviewed",
  "admin.user_disabled": "User Disabled",
  "admin.user_enabled": "User Enabled",
  "admin.flag_resolved": "Flag Resolved",
  "admin.role_set": "Role Set",
  "admin.order_cancelled": "Order Cancelled",
  "email.new_trade": "Email: New Trade",
  "email.trade_confirmed": "Email: Confirmed",
  "email.trade_declined": "Email: Declined",
  "email.shipping_label": "Email: Shipping Label",
  "email.sneakers_received": "Email: Sneakers Received",
  "email.outbound_label": "Email: Outbound Label",
  "email.counterfeit": "Email: Counterfeit",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  "trade.created": "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  "trade.declined": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "trade.payment_captured": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "trade.payment_failed": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "trade.completed": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "label.inbound_created": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  "label.outbound_created": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  "auth.result": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "auth.sneakers_received": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "admin.order_cancelled": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "email.new_trade": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  "email.trade_confirmed": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  "email.trade_declined": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  "email.shipping_label": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  "email.sneakers_received": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  "email.outbound_label": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  "email.counterfeit": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const EVENT_TYPE_GROUPS = [
  { label: "All Events", value: "all" },
  { label: "Payments", value: "trade.payment" },
  { label: "Trades", value: "trade." },
  { label: "Shipping", value: "label." },
  { label: "Authentication", value: "auth." },
  { label: "Admin Actions", value: "admin." },
  { label: "Emails", value: "email." },
];

function relativeTime(ts: Timestamp | null): string {
  if (!ts) return "—";
  const date = ts.toDate();
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return format(date, "MMM d, h:mm a");
}

function fullTime(ts: Timestamp | null): string {
  if (!ts) return "";
  return format(ts.toDate(), "MMM d, yyyy h:mm:ss a");
}

function eventTypeColor(eventType: string): string {
  return EVENT_TYPE_COLORS[eventType] ?? "bg-muted text-muted-foreground";
}

export const AuditLogPage = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | AuditStatus>("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "auditLogs"),
      orderBy("timestamp", "desc"),
      limit(200)
    );

    const unsub = onSnapshot(q, (snap) => {
      setEntries(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditEntry, "id">) }))
      );
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const searchLower = search.trim().toLowerCase();
  const filtered = entries.filter((e) => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (groupFilter !== "all" && !e.eventType.startsWith(groupFilter)) return false;
    if (searchLower) {
      const recipientEmail = String(e.metadata?.to ?? "").toLowerCase();
      if (!e.targetId.toLowerCase().includes(searchLower) && !e.actorId.toLowerCase().includes(searchLower) && !recipientEmail.includes(searchLower)) return false;
    }
    return true;
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time platform activity trail</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 mb-5">
        {/* Trade / order ID search */}
        <input
          type="text"
          placeholder="Filter by trade ID or user ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-sm rounded-xl border border-border bg-background px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#3366FF]/40 placeholder:text-muted-foreground"
        />

        {/* Event type group pills */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {EVENT_TYPE_GROUPS.map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => setGroupFilter(g.value)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                groupFilter === g.value
                  ? "bg-[#3366FF] text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Status tabs */}
        <div className="flex gap-2">
          {(["all", "success", "failure"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors capitalize ${
                statusFilter === s
                  ? s === "failure"
                    ? "bg-red-500 text-white"
                    : s === "success"
                    ? "bg-emerald-500 text-white"
                    : "bg-[#3366FF] text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all" ? "All Status" : s}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground self-center">
            {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
          </span>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No audit entries match your filters.
        </div>
      )}

      {/* Entries */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-1.5">
          {filtered.map((entry) => {
            const isExpanded = expandedId === entry.id;
            return (
              <div
                key={entry.id}
                className="rounded-xl border border-border bg-card overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.05)]"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/40 transition-colors"
                >
                  {/* Status dot */}
                  <span
                    className={`shrink-0 w-2 h-2 rounded-full ${
                      entry.status === "success" ? "bg-emerald-500" : "bg-red-500"
                    }`}
                  />

                  {/* Event type pill */}
                  <span
                    className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${eventTypeColor(entry.eventType)}`}
                  >
                    {EVENT_TYPE_LABELS[entry.eventType] ?? entry.eventType}
                  </span>

                  {/* Target ID */}
                  <span className="min-w-0 flex-1 text-xs text-muted-foreground font-mono truncate">
                    {entry.targetId}
                  </span>

                  {/* Actor */}
                  <span className="shrink-0 text-[10px] text-muted-foreground hidden sm:block font-mono truncate max-w-[120px]">
                    {entry.actorId === "system" ? "⚙ system" : entry.actorId.slice(0, 8) + "…"}
                  </span>

                  {/* Duration */}
                  {entry.durationMs > 0 && (
                    <span className="shrink-0 text-[10px] text-muted-foreground hidden md:block">
                      {entry.durationMs}ms
                    </span>
                  )}

                  {/* Timestamp */}
                  <span
                    className="shrink-0 text-[10px] text-muted-foreground"
                    title={fullTime(entry.timestamp)}
                  >
                    {relativeTime(entry.timestamp)}
                  </span>

                  {/* Expand chevron */}
                  <span className="shrink-0 text-muted-foreground text-xs">{isExpanded ? "▲" : "▼"}</span>
                </button>

                {/* Expanded metadata */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-3 bg-muted/30">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mb-3">
                      <div>
                        <span className="text-muted-foreground">Function: </span>
                        <span className="font-mono text-foreground">{entry.functionName}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Target type: </span>
                        <span className="text-foreground">{entry.targetType}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Actor: </span>
                        <span className="font-mono text-foreground">{entry.actorId}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Status: </span>
                        <span className={entry.status === "success" ? "text-emerald-500" : "text-red-500"}>
                          {entry.status}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Time: </span>
                        <span className="text-foreground">{fullTime(entry.timestamp)}</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Metadata</p>
                    <pre className="text-xs font-mono text-foreground bg-background rounded-lg p-3 overflow-x-auto border border-border/50">
                      {JSON.stringify(entry.metadata, null, 2)}
                    </pre>
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

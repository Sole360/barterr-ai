import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeftRight, Ban, CheckCheck, CheckCircle2, FileEdit, PackageCheck, RefreshCw, XCircle } from "lucide-react";
import type { NotificationDoc, NotificationType } from "@/lib/firebase/useNotifications";

function relativeTime(ts: { toDate: () => Date } | null): string {
  if (!ts) return "";
  const date = ts.toDate();
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function NotificationIcon({ type }: { type: NotificationType }) {
  const base = "w-8 h-8 rounded-full flex items-center justify-center shrink-0";
  switch (type) {
    case "new_trade":
      return (
        <div className={`${base} bg-blue-100 dark:bg-blue-900/40`}>
          <ArrowLeftRight className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </div>
      );
    case "trade_accepted":
      return (
        <div className={`${base} bg-emerald-100 dark:bg-emerald-900/40`}>
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </div>
      );
    case "trade_declined":
      return (
        <div className={`${base} bg-red-100 dark:bg-red-900/40`}>
          <XCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
        </div>
      );
    case "trade_completed":
      return (
        <div className={`${base} bg-purple-100 dark:bg-purple-900/40`}>
          <PackageCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
        </div>
      );
    case "account_warning":
      return (
        <div className={`${base} bg-amber-100 dark:bg-amber-900/40`}>
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        </div>
      );
    case "account_banned":
      return (
        <div className={`${base} bg-red-100 dark:bg-red-900/40`}>
          <Ban className="w-4 h-4 text-red-500 dark:text-red-400" />
        </div>
      );
    case "listing_changes_requested":
      return (
        <div className={`${base} bg-amber-100 dark:bg-amber-900/40`}>
          <FileEdit className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        </div>
      );
    case "trade_countered":
      return (
        <div className={`${base} bg-purple-100 dark:bg-purple-900/40`}>
          <RefreshCw className="w-4 h-4 text-purple-600 dark:text-purple-400" />
        </div>
      );
    case "order_cancelled":
      return (
        <div className={`${base} bg-red-100 dark:bg-red-900/40`}>
          <XCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
        </div>
      );
  }
}

function navPathForNotification(n: NotificationDoc): string {
  if (n.type === "account_warning" || n.type === "account_banned") return "/settings";
  if (n.type === "listing_changes_requested") return "/profile";
  if (n.data.tradeId) return `/trades/${n.data.tradeId}`;
  return "/trades";
}

type Props = {
  notifications: NotificationDoc[];
  loading: boolean;
  unreadCount: number;
  onMarkAllRead: () => void;
  onMarkRead: (id: string) => void;
};

export function NotificationPanel({
  notifications,
  loading,
  unreadCount,
  onMarkAllRead,
  onMarkRead,
}: Props) {
  const navigate = useNavigate();

  const handleClick = (n: NotificationDoc) => {
    if (!n.read) onMarkRead(n.id);
    navigate(navPathForNotification(n));
  };

  return (
    <div className="w-80 rounded-2xl bg-background border border-border shadow-[0_8px_32px_rgba(0,0,0,0.14)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-foreground">Notifications</span>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {/* Body */}
      <div className="max-h-[380px] overflow-y-auto">
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : notifications.length === 0 ? (
          <div className="py-10 text-center">
            <div className="text-2xl mb-1">🔔</div>
            <div className="text-sm text-muted-foreground">No notifications yet</div>
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleClick(n)}
              className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent border-b border-border/50 last:border-b-0 ${
                !n.read ? "bg-blue-50/50 dark:bg-blue-950/20" : ""
              }`}
            >
              <NotificationIcon type={n.type} />
              <div className="min-w-0 flex-1">
                <div className={`text-xs leading-snug ${!n.read ? "font-semibold text-foreground" : "text-foreground"}`}>
                  {n.title}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.body}</div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1.5">
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {relativeTime(n.createdAt)}
                </span>
                {!n.read && (
                  <span className="w-2 h-2 rounded-full bg-[#3366FF]" />
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

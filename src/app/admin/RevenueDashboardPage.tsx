import { useEffect, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format, startOfDay, startOfWeek, startOfMonth } from "date-fns";
import { TrendingUp, DollarSign, RefreshCw, ArrowDownLeft, ShoppingBag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TimeSeriesPoint {
  date: string;
  grossCents: number;
  netCents: number;
}

interface TransactionRow {
  id: string;
  created: number;
  type: string;
  grossCents: number;
  feeCents: number;
  netCents: number;
  description: string;
}

interface RevenueStats {
  grossRevenueCents: number;
  stripeFeesCents: number;
  netRevenueCents: number;
  refundTotalCents: number;
  orderCount: number;
  avgOrderValueCents: number;
  timeSeries: TimeSeriesPoint[];
  transactions: TransactionRow[];
}

const ITEMS_PER_PAGE = 25;

function cents(c: number): string {
  return `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type Preset = "today" | "week" | "month" | "custom";

const KPI_ITEMS = (stats: RevenueStats) => [
  {
    label: "Gross Revenue",
    value: cents(stats.grossRevenueCents),
    icon: <DollarSign className="w-5 h-5" />,
    color: "bg-blue-100 dark:bg-blue-900/30 text-[#3366FF]",
  },
  {
    label: "Stripe Fees",
    value: cents(stats.stripeFeesCents),
    icon: <RefreshCw className="w-5 h-5" />,
    color: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
  },
  {
    label: "Net Revenue",
    value: cents(stats.netRevenueCents),
    icon: <TrendingUp className="w-5 h-5" />,
    color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
  },
  {
    label: "Refunds",
    value: cents(stats.refundTotalCents),
    icon: <ArrowDownLeft className="w-5 h-5" />,
    color: "bg-red-100 dark:bg-red-900/30 text-red-500",
  },
  {
    label: "Orders",
    value: `${stats.orderCount}`,
    icon: <ShoppingBag className="w-5 h-5" />,
    color: "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400",
    sub: stats.orderCount > 0 ? `Avg ${cents(stats.avgOrderValueCents)}` : undefined,
  },
];

export const RevenueDashboardPage = () => {
  const { toast } = useToast();
  const [preset, setPreset] = useState<Preset>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  const fetchStats = async (startDate: string, endDate: string) => {
    setLoading(true);
    setStats(null);
    setPage(0);
    try {
      const fns = getFunctions(undefined, "us-central1");
      const res = await httpsCallable<{ startDate: string; endDate: string }, RevenueStats>(
        fns,
        "getRevenueStats"
      )({ startDate, endDate });
      setStats(res.data);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "Failed to load revenue data";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const today = new Date();
    fetchStats(toIso(startOfMonth(today)), toIso(today));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectPreset = (p: Preset) => {
    setPreset(p);
    const today = new Date();
    if (p === "today") {
      const d = toIso(startOfDay(today));
      fetchStats(d, d);
    } else if (p === "week") {
      fetchStats(toIso(startOfWeek(today, { weekStartsOn: 1 })), toIso(today));
    } else if (p === "month") {
      fetchStats(toIso(startOfMonth(today)), toIso(today));
    }
  };

  const PRESETS: { label: string; value: Preset }[] = [
    { label: "Today", value: "today" },
    { label: "This Week", value: "week" },
    { label: "This Month", value: "month" },
    { label: "Custom Range", value: "custom" },
  ];

  const chartData = stats?.timeSeries.map((p) => ({
    date: format(new Date(p.date + "T12:00:00"), "MMM d"),
    "Gross ($)": parseFloat((p.grossCents / 100).toFixed(2)),
    "Net ($)": parseFloat((p.netCents / 100).toFixed(2)),
  })) ?? [];

  const paginatedTxns = stats?.transactions.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE) ?? [];
  const totalPages = stats ? Math.ceil(stats.transactions.length / ITEMS_PER_PAGE) : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Revenue Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Stripe financial data — charges, fees, and refunds</p>
      </div>

      {/* Date filter */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => selectPreset(p.value)}
              disabled={loading}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-40 ${
                preset === p.value
                  ? "bg-[#3366FF] text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Start date</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3366FF]/40"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">End date</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3366FF]/40"
              />
            </div>
            <button
              type="button"
              disabled={!customStart || !customEnd || loading}
              onClick={() => fetchStats(customStart, customEnd)}
              className="px-4 py-2 rounded-full text-sm font-semibold bg-[#3366FF] text-white hover:bg-[#3366FF]/90 disabled:opacity-40 transition-colors"
            >
              {loading ? "Loading…" : "Fetch"}
            </button>
          </div>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 sm:h-24 rounded-xl sm:rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
          <div className="h-64 rounded-2xl bg-muted animate-pulse" />
        </div>
      )}

      {/* Results */}
      {!loading && stats && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
            {KPI_ITEMS(stats).map((k) => (
              <div
                key={k.label}
                className="rounded-xl sm:rounded-2xl border border-border bg-card p-2 sm:p-4 shadow-[0_2px_12px_rgba(0,0,0,0.05)]"
              >
                <div className={`inline-flex p-1 sm:p-2 rounded-lg sm:rounded-xl mb-1.5 sm:mb-3 ${k.color}`}>
                  <span className="w-3.5 h-3.5 sm:w-5 sm:h-5 [&>svg]:w-full [&>svg]:h-full">{k.icon}</span>
                </div>
                <div className="text-sm sm:text-xl font-bold text-foreground tabular-nums leading-tight">{k.value}</div>
                <div className="text-[9px] sm:text-xs text-muted-foreground mt-0.5 leading-tight">{k.label}</div>
                {k.sub && <div className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 hidden sm:block">{k.sub}</div>}
              </div>
            ))}
          </div>

          {/* Chart */}
          {chartData.length > 0 ? (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
              <h3 className="text-sm font-semibold text-foreground mb-4">Revenue Over Time</h3>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="grossGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3366FF" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#3366FF" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#33FF99" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#33FF99" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    formatter={(value) => [`$${Number(value).toFixed(2)}`]}
                    contentStyle={{ borderRadius: "12px", border: "1px solid var(--border)", background: "var(--card)" }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="Gross ($)"
                    stroke="#3366FF"
                    strokeWidth={2}
                    fill="url(#grossGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="Net ($)"
                    stroke="#33FF99"
                    strokeWidth={2}
                    fill="url(#netGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No transaction data in this date range.
            </div>
          )}

          {/* Transaction table */}
          {stats.transactions.length > 0 && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">
                  Transactions
                  <span className="ml-2 text-xs font-normal text-muted-foreground">({stats.transactions.length} total)</span>
                </h3>
              </div>

              {/* Header */}
              <div className="grid grid-cols-6 gap-2 px-5 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground border-b border-border bg-muted/30">
                <div className="col-span-2">Date</div>
                <div>Type</div>
                <div className="text-right">Gross</div>
                <div className="text-right">Fee</div>
                <div className="text-right">Net</div>
              </div>

              {paginatedTxns.map((tx) => (
                <div
                  key={tx.id}
                  className="grid grid-cols-6 gap-2 px-5 py-3 text-xs border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors"
                >
                  <div className="col-span-2 text-muted-foreground">
                    {format(new Date(tx.created * 1000), "MMM d, yyyy h:mm a")}
                  </div>
                  <div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                      tx.type === "refund"
                        ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    }`}>
                      {tx.type}
                    </span>
                  </div>
                  <div className="text-right font-mono text-foreground">{cents(Math.abs(tx.grossCents))}</div>
                  <div className="text-right font-mono text-muted-foreground">{cents(tx.feeCents)}</div>
                  <div className={`text-right font-mono font-semibold ${tx.netCents < 0 ? "text-red-500" : "text-foreground"}`}>
                    {cents(tx.netCents)}
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="text-xs text-[#3366FF] hover:underline disabled:opacity-40 disabled:no-underline"
                  >
                    ← Previous
                  </button>
                  <span className="text-xs text-muted-foreground">
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="text-xs text-[#3366FF] hover:underline disabled:opacity-40 disabled:no-underline"
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Empty prompt */}
      {!loading && !stats && (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Select a date range above to load revenue data.
        </div>
      )}
    </div>
  );
};

import { useEffect, useState } from "react";
import { collection, getCountFromServer, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { ShieldAlert, PackageSearch, Users, ArrowLeftRight } from "lucide-react";

type Stat = { label: string; value: number; icon: React.ReactNode; color: string };

export const AdminDashboard = () => {
  const [stats, setStats] = useState<Stat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [flagged, pendingListings, users, trades] = await Promise.all([
          getCountFromServer(query(collection(db, "flaggedAttempts"), where("resolved", "!=", true))),
          getCountFromServer(query(collection(db, "posts"), where("status", "==", "pending_review"))),
          getCountFromServer(collection(db, "users")),
          getCountFromServer(collection(db, "trades")),
        ]);

        setStats([
          {
            label: "Unresolved Flags",
            value: flagged.data().count,
            icon: <ShieldAlert className="w-5 h-5" />,
            color: "text-red-500 bg-red-100 dark:bg-red-900/30",
          },
          {
            label: "Pending Listings",
            value: pendingListings.data().count,
            icon: <PackageSearch className="w-5 h-5" />,
            color: "text-amber-500 bg-amber-100 dark:bg-amber-900/30",
          },
          {
            label: "Total Users",
            value: users.data().count,
            icon: <Users className="w-5 h-5" />,
            color: "text-blue-500 bg-blue-100 dark:bg-blue-900/30",
          },
          {
            label: "Total Trades",
            value: trades.data().count,
            icon: <ArrowLeftRight className="w-5 h-5" />,
            color: "text-purple-500 bg-purple-100 dark:bg-purple-900/30",
          },
        ]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-foreground mb-6">Dashboard</h1>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl bg-card border border-border p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
            >
              <div className={`inline-flex p-2 rounded-xl mb-3 ${s.color}`}>
                {s.icon}
              </div>
              <div className="text-2xl font-bold text-foreground">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

import { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query, startAfter, type QueryDocumentSnapshot } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Search, UserX, UserCheck, Users } from "lucide-react";
import { db } from "@/lib/firebase/config";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type UserDoc = {
  id: string;
  displayName: string;
  email: string;
  photoURL?: string;
  accountStatus?: string;
  onboardingFinished?: boolean;
  createdAt?: { toDate: () => Date } | null;
};

const PAGE_SIZE = 20;

export const UserManagementPage = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const loadUsers = async (reset = false) => {
    setLoading(true);
    try {
      let q = query(collection(db, "users"), orderBy("displayName"), limit(PAGE_SIZE));
      if (!reset && lastDoc) q = query(collection(db, "users"), orderBy("displayName"), startAfter(lastDoc), limit(PAGE_SIZE));

      const snap = await getDocs(q);
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserDoc));
      setUsers(reset ? docs : (prev) => [...prev, ...docs]);
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(true); }, []);

  const filtered = search.trim()
    ? users.filter(
        (u) =>
          u.displayName?.toLowerCase().includes(search.toLowerCase()) ||
          u.email?.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  const callAdmin = async (fn: string, uid: string, label: string) => {
    setActing(uid);
    try {
      const fns = getFunctions(undefined, "us-central1");
      await httpsCallable(fns, fn)({ uid });
      toast({ title: label });
      // Refresh the list
      await loadUsers(true);
    } catch {
      toast({ title: "Error", description: "Action failed", variant: "destructive" });
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-foreground mb-5">Users</h1>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#3366FF]/40"
        />
      </div>

      {loading && users.length === 0 ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <div className="text-sm text-muted-foreground">No users found</div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => {
            const isDisabled = u.accountStatus === "disabled";
            const initials = u.displayName?.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("") ?? "?";
            return (
              <div
                key={u.id}
                className={`rounded-2xl border border-border bg-card p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center gap-3 ${isDisabled ? "opacity-60" : ""}`}
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={u.photoURL} alt={u.displayName} className="object-cover" />
                  <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-[#33FF99]/60 to-[#3366FF]/60">
                    {initials}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-foreground truncate">{u.displayName}</div>
                  <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                  {isDisabled && (
                    <div className="text-[10px] font-semibold text-red-500 mt-0.5">Disabled</div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {isDisabled ? (
                    <button
                      type="button"
                      disabled={acting === u.id}
                      onClick={() => callAdmin("enableUser", u.id, "User enabled")}
                      className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:opacity-80 transition-opacity disabled:opacity-40"
                      title="Enable account"
                    >
                      <UserCheck className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={acting === u.id}
                      onClick={() => callAdmin("disableUser", u.id, "User disabled")}
                      className="p-2 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:opacity-80 transition-opacity disabled:opacity-40"
                      title="Disable account"
                    >
                      <UserX className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {!search && hasMore && (
            <button
              type="button"
              onClick={() => loadUsers(false)}
              disabled={loading}
              className="w-full py-3 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ShieldAlert,
  PackageSearch,
  Users,
  ArrowLeftRight,
  Megaphone,
  LogOut,
  Settings,
  Filter,
} from "lucide-react";
import { useAuth } from "@/lib/contexts/auth.context";

const NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/flagged", label: "Flagged", icon: ShieldAlert },
  { to: "/admin/listings", label: "Listings", icon: PackageSearch },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/trades", label: "Trades", icon: ArrowLeftRight },
  { to: "/admin/announcements", label: "Broadcast", icon: Megaphone },
];

const linkBase =
  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors";
const linkActive = "bg-[#3366FF]/10 text-[#3366FF]";
const linkInactive = "text-muted-foreground hover:bg-accent hover:text-foreground";

// Mobile bottom tab — icon + short label
const mobileBase =
  "flex flex-col items-center gap-0.5 px-3 py-2 text-[10px] font-medium transition-colors";
const mobileActive = "text-[#3366FF]";
const mobileInactive = "text-muted-foreground";

export const AdminShell = () => {
  const { adminRole, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-border bg-card h-screen sticky top-0">
        {/* Logo / brand */}
        <div className="px-4 py-5 border-b border-border">
          <div className="flex items-center gap-2">
            <img src="/barterr-main-icon.png" alt="Barterr" className="h-7 w-auto" />
            <div>
              <div className="text-xs font-bold text-foreground leading-none">BARTERR</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest leading-none mt-0.5">
                {adminRole === "super_admin" ? "Super Admin" : "Admin"}
              </div>
            </div>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkInactive}`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ))}
          <NavLink
            to="/admin/content-filter"
            className={({ isActive }) =>
              `${linkBase} ${isActive ? linkActive : linkInactive}`
            }
          >
            <Filter className="w-4 h-4 shrink-0" />
            Content Filter
          </NavLink>
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-border space-y-1">
          {adminRole === "super_admin" && (
            <NavLink
              to="/admin/settings"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkInactive}`
              }
            >
              <Settings className="w-4 h-4 shrink-0" />
              Settings
            </NavLink>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className={`${linkBase} ${linkInactive} w-full text-left`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-card sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <img src="/barterr-main-icon.png" alt="Barterr" className="h-6 w-auto" />
            <span className="text-xs font-bold text-foreground uppercase tracking-widest">Admin</span>
          </div>
          <button type="button" onClick={handleLogout} className="p-2 rounded-lg hover:bg-accent transition-colors">
            <LogOut className="w-4 h-4 text-muted-foreground" />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile bottom tab bar ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border flex items-center justify-around px-1 safe-area-inset-bottom">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `${mobileBase} ${isActive ? mobileActive : mobileInactive}`
            }
          >
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};

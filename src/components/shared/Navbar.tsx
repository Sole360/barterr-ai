import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/contexts/auth.context";
import {
  Bell,
  User,
  LogOut,
  Settings,
  ArrowLeftRight,
  MessageSquare,
  Sun,
  Moon,
  ShieldCheck,
  LayoutGrid,
  Plus,
} from "lucide-react";
import { useTheme } from "@/lib/contexts/theme.context";
import { AnnouncementRibbon } from "./AnnouncementRibbon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SearchBar } from "./SearchBar";
import { PostDetailModal } from "@/components/dialogs/PostDetailModal";
import { NotificationPanel } from "./NotificationPanel";
import { AddSneakerDialog } from "@/components/dialogs/AddSneakerDialog";
import { useNotifications } from "@/lib/firebase/useNotifications";
import { getPostById } from "@/lib/firebase/posts.service";
import { Post } from "@/types";

const BOTTOM_NAV = [
  { label: "Home", icon: LayoutGrid, path: "/dashboard" },
  { label: "Trades", icon: ArrowLeftRight, path: "/trades" },
  { label: "Messages", icon: MessageSquare, path: "/messages" },
  { label: "Profile", icon: User, path: "/profile" },
];

export const Navbar = () => {
  const { currentUser, userProfile, adminRole, logout } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const mobileNotifRef = useRef<HTMLDivElement>(null);

  const { notifications, loading: notifLoading, unreadCount, markRead, markAllRead } =
    useNotifications(currentUser?.uid);

  // Close notification panel on outside click
  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e: MouseEvent) => {
      const clickedDesktop = notifRef.current?.contains(e.target as Node);
      const clickedMobile = mobileNotifRef.current?.contains(e.target as Node);
      if (!clickedDesktop && !clickedMobile) setNotifOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notifOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleSelectPost = async (postId: string) => {
    try {
      const post = await getPostById(postId);
      if (post) setSelectedPost(post);
    } catch (error) {
      console.error("Error loading post:", error);
    }
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50">
        <AnnouncementRibbon />

        {/* ── MOBILE top bar ── */}
        <div className="md:hidden bg-background border-b border-border h-14 flex items-center justify-between px-4">
          <Link to="/dashboard">
            <img src="https://firebasestorage.googleapis.com/v0/b/barterr-dev-98dfd.firebasestorage.app/o/public%2Fbarterr-icon-glyph-gradient.png?alt=media&token=1ebf5744-52b4-4d42-9673-a9799b5fb1c1" alt="Barterr" className="h-7 w-auto" />
          </Link>

          <div className="flex items-center gap-1">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-accent rounded-lg transition-colors"
              title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {resolvedTheme === "dark" ? (
                <Sun className="w-5 h-5 text-foreground" />
              ) : (
                <Moon className="w-5 h-5 text-foreground" />
              )}
            </button>

            {/* Notifications */}
            <div ref={mobileNotifRef} className="relative">
              <button
                onClick={() => setNotifOpen((v) => !v)}
                className="relative p-2 hover:bg-accent rounded-lg transition-colors"
                title="Notifications"
              >
                <Bell className="w-5 h-5 text-foreground" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-[#3366FF] rounded-full" />
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 z-50">
                  <NotificationPanel
                    notifications={notifications}
                    loading={notifLoading}
                    unreadCount={unreadCount}
                    onMarkAllRead={markAllRead}
                    onMarkRead={markRead}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── DESKTOP nav bar ── */}
        <nav className="hidden md:block bg-background border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              {/* Logo */}
              <Link to="/dashboard" className="flex items-center">
                <img
                  src="https://firebasestorage.googleapis.com/v0/b/barterr-dev-98dfd.firebasestorage.app/o/public%2Fbarterr-icon-glyph-gradient.png?alt=media&token=1ebf5744-52b4-4d42-9673-a9799b5fb1c1"
                  alt="Barterr"
                  className="h-8 w-auto md:h-10 lg:h-12"
                />
              </Link>

              {/* Desktop Search Bar */}
              <div className="flex flex-1 max-w-md mx-8">
                <SearchBar onSelectPost={handleSelectPost} />
              </div>

              {/* Right Side Icons */}
              <div className="flex items-center space-x-4">
                {/* Theme toggle */}
                <button
                  onClick={toggleTheme}
                  className="relative p-2 hover:bg-accent rounded-lg transition-colors"
                  title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                >
                  {resolvedTheme === "dark" ? (
                    <Sun className="w-5 h-5 text-foreground" />
                  ) : (
                    <Moon className="w-5 h-5 text-foreground" />
                  )}
                </button>

                {/* Messages */}
                <button
                  onClick={() => navigate("/messages")}
                  className="relative p-2 hover:bg-accent rounded-lg transition-colors"
                  title="Messages"
                >
                  <MessageSquare className="w-5 h-5 text-foreground" />
                </button>

                {/* Trades */}
                <button
                  onClick={() => navigate("/trades")}
                  className="relative p-2 hover:bg-accent rounded-lg transition-colors"
                  title="My Trades"
                >
                  <ArrowLeftRight className="w-5 h-5 text-foreground" />
                </button>

                {/* Notifications */}
                <div ref={notifRef} className="relative">
                  <button
                    onClick={() => setNotifOpen((v) => !v)}
                    className="relative p-2 hover:bg-accent rounded-lg transition-colors"
                    title="Notifications"
                  >
                    <Bell className="w-5 h-5 text-foreground" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 w-2 h-2 bg-[#3366FF] rounded-full" />
                    )}
                  </button>
                  {notifOpen && (
                    <div className="absolute right-0 top-full mt-2 z-50">
                      <NotificationPanel
                        notifications={notifications}
                        loading={notifLoading}
                        unreadCount={unreadCount}
                        onMarkAllRead={markAllRead}
                        onMarkRead={markRead}
                      />
                    </div>
                  )}
                </div>

                {/* Profile Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center space-x-2 p-2 hover:bg-accent rounded-lg transition-colors">
                      {userProfile?.photoURL ? (
                        <img
                          src={userProfile.photoURL}
                          alt="Profile"
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#33FF99] to-[#3366FF] flex items-center justify-center">
                          <User className="w-5 h-5 text-white" />
                        </div>
                      )}
                      <span className="hidden sm:block text-sm font-medium text-foreground">
                        {userProfile?.firstName ?? "User"}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="px-2 py-1.5">
                      <p className="text-sm font-medium text-foreground">{userProfile?.displayName}</p>
                      <p className="text-xs text-muted-foreground">{currentUser?.email}</p>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate("/profile")}>
                      <User className="w-4 h-4 mr-2" />
                      Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/trades")}>
                      <ArrowLeftRight className="w-4 h-4 mr-2" />
                      My Trades
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/account")}>
                      <Settings className="w-4 h-4 mr-2" />
                      Account Settings
                    </DropdownMenuItem>
                    {adminRole && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => navigate("/admin")}>
                          <ShieldCheck className="w-4 h-4 mr-2 text-[#3366FF]" />
                          <span className="text-[#3366FF] font-medium">Admin Panel</span>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout}>
                      <LogOut className="w-4 h-4 mr-2" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </nav>
      </div>

      {/* ── MOBILE bottom tab bar ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-14">
          {BOTTOM_NAV.slice(0, 2).map(({ label, icon: Icon, path }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center gap-0.5 px-4 py-2 text-[10px] font-medium transition-colors ${
                isActive(path) ? "text-[#3366FF]" : "text-muted-foreground"
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}

          {/* Center Add button */}
          <button
            onClick={() => setAddOpen(true)}
            className="flex flex-col items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-[#3366FF] to-[#33FF99] shadow-md -mt-4 transition-transform active:scale-95"
            title="Add Sneaker"
          >
            <Plus className="w-5 h-5 text-white" />
          </button>

          {BOTTOM_NAV.slice(2).map(({ label, icon: Icon, path }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center gap-0.5 px-4 py-2 text-[10px] font-medium transition-colors ${
                isActive(path) ? "text-[#3366FF]" : "text-muted-foreground"
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <AddSneakerDialog open={addOpen} onClose={() => setAddOpen(false)} />

      {/* Post Detail Modal */}
      {selectedPost && (
        <PostDetailModal
          open={selectedPost !== null}
          onClose={() => setSelectedPost(null)}
          post={selectedPost}
        />
      )}
    </>
  );
};

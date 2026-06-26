import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/contexts/auth.context";
import { Bell, User, LogOut, Settings, ArrowLeftRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SearchBar } from "./SearchBar";
import { PostDetailModal } from "@/components/dialogs/PostDetailModal";
import { getPostById } from "@/lib/firebase/posts.service";
import { Post } from "@/types";

export const Navbar = () => {
  const { currentUser, userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleSelectPost = async (postId: string) => {
    try {
      const post = await getPostById(postId);
      if (post) {
        setSelectedPost(post);
      }
    } catch (error) {
      console.error("Error loading post:", error);
    }
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link to="/dashboard" className="flex items-center">
              <img
                src="/barterr-main-icon.png"
                alt="Barterr"
                className="h-8 w-auto md:h-10 lg:h-12"
              />
            </Link>

            {/* Desktop Search Bar */}
            <div className="hidden md:flex flex-1 max-w-md mx-8">
              <SearchBar onSelectPost={handleSelectPost} />
            </div>

            {/* Right Side Icons */}
            <div className="flex items-center space-x-4">
              {/* Trades */}
              <button
                onClick={() => navigate("/trades")}
                className="relative p-2 hover:bg-gray-100 rounded-lg"
                title="My Trades"
              >
                <ArrowLeftRight className="w-5 h-5 text-gray-600" />
              </button>

              {/* Notifications */}
              <button className="relative p-2 hover:bg-gray-100 rounded-lg">
                <Bell className="w-5 h-5 text-gray-600" />
                {userProfile && userProfile.numNotification > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                )}
              </button>

              {/* Profile Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center space-x-2 p-2 hover:bg-gray-100 rounded-lg">
                    {userProfile?.photoURL ? (
                      <img
                        src={userProfile.photoURL}
                        alt="Profile"
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#33FF99] to-[#3366FF] flex items-center justify-center">
                        <User className="w-5 h-5 text-white" />
                      </div>
                    )}
                    <span className="hidden sm:block text-sm font-medium text-gray-700">
                      {userProfile?.firstName ?? "User"}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium text-gray-900">
                      {userProfile?.displayName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {currentUser?.email}
                    </p>
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
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Mobile Search Bar */}
          <div className="md:hidden pb-3">
            <SearchBar onSelectPost={handleSelectPost} />
          </div>
        </div>
      </nav>

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

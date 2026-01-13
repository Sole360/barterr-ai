import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Navbar } from "@/components/shared/Navbar";
import { PostDetailModal } from "@/components/dialogs/PostDetailModal";
import { AddSneakerDialog } from "@/components/dialogs/AddSneakerDialog";
import type { Post, BrandFilter } from "@/types";
import {
  subscribeToPosts,
  subscribeToPostsByBrand,
} from "@/lib/firebase/posts.service";

export const DashboardPage = () => {
  const [selectedBrand, setSelectedBrand] = useState<BrandFilter>("All");
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [addSneakerOpen, setAddSneakerOpen] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const brands: BrandFilter[] = [
    "All",
    "Nike",
    "Adidas",
    "Jordan",
    "New Balance",
    "Other",
  ];

  // Subscribe to posts based on selected brand
  useEffect(() => {
    setLoading(true);
    setError(null);

    let unsubscribe: (() => void) | undefined;

    if (selectedBrand === "All") {
      // Subscribe to all posts
      unsubscribe = subscribeToPosts(
        (fetchedPosts) => {
          setPosts(fetchedPosts);
          setLoading(false);
        },
        (err) => {
          console.error("Error fetching posts:", err);
          setError("Failed to load sneakers");
          setLoading(false);
        }
      );
    } else {
      // Subscribe to posts by brand
      unsubscribe = subscribeToPostsByBrand(
        selectedBrand,
        (fetchedPosts) => {
          setPosts(fetchedPosts);
          setLoading(false);
        },
        (err) => {
          console.error("Error fetching posts:", err);
          setError("Failed to load sneakers");
          setLoading(false);
        }
      );
    }

    // Cleanup subscription when component unmounts or brand changes
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [selectedBrand]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="pt-20 pb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Discover</h1>
            <p className="text-gray-600">Browse sneakers available for trade</p>
          </div>

          {/* Brand Filter Tabs */}
          <div className="mb-6 overflow-x-auto">
            <div className="flex space-x-2 min-w-max pb-2">
              {brands.map((brand) => (
                <button
                  key={brand}
                  onClick={() => setSelectedBrand(brand)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                    selectedBrand === brand
                      ? "bg-[#3366FF] text-white"
                      : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
                  }`}
                >
                  {brand}
                </button>
              ))}
            </div>
          </div>

          {/* Results Count */}
          <div className="mb-4">
            <p className="text-sm text-gray-600">
              {loading
                ? "Loading..."
                : `${posts.length} ${
                    posts.length === 1 ? "sneaker" : "sneakers"
                  } available`}
            </p>
          </div>

          {/* Error State */}
          {error && (
            <div className="text-center py-12">
              <p className="text-red-500 mb-2">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="text-sm text-[#3366FF] hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {/* Loading State */}
          {loading && !error && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
              {[...Array(10)].map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-lg shadow-sm overflow-hidden animate-pulse"
                >
                  <div className="aspect-[4/3] bg-gray-200" />
                  <div className="p-4 space-y-3">
                    <div className="h-3 bg-gray-200 rounded w-1/3" />
                    <div className="h-4 bg-gray-200 rounded w-full" />
                    <div className="h-3 bg-gray-200 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sneaker Grid */}
          {!loading && !error && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
              {posts.map((post) => (
                <div
                  key={post.postId}
                  onClick={() => setSelectedPost(post)}
                  className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden cursor-pointer"
                >
                  <div className="aspect-square bg-white rounded-lg overflow-hidden flex items-center justify-center p-4">
                    <img
                      src={post.productImageUrl}
                      alt={post.title}
                      className="w-full h-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  <div className="p-4">
                    <p className="text-xs font-medium text-[#3366FF] mb-1">
                      {post.brand}
                    </p>
                    <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                      {post.title}
                    </h3>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && posts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-2">No sneakers found</p>
              <p className="text-sm text-gray-400">
                {selectedBrand === "All"
                  ? "Be the first to add a sneaker!"
                  : `Try selecting a different brand or add some ${selectedBrand} sneakers`}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Floating Action Button */}
      <button
        onClick={() => setAddSneakerOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-[#3366FF] text-white rounded-full shadow-lg hover:bg-[#3366FF]/90 hover:scale-110 transition-all flex items-center justify-center z-40"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Post Detail Modal */}
      {selectedPost && (
        <PostDetailModal
          open={!!selectedPost}
          onClose={() => setSelectedPost(null)}
          post={selectedPost}
        />
      )}

      {/* Add Sneaker Dialog */}
      <AddSneakerDialog
        open={addSneakerOpen}
        onClose={() => setAddSneakerOpen(false)}
      />
    </div>
  );
};

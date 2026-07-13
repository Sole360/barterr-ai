import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Navbar } from "@/components/shared/Navbar";
import { PostDetailModal } from "@/components/dialogs/PostDetailModal";
import { AddSneakerDialog } from "@/components/dialogs/AddSneakerDialog";
import { PageTransition } from "@/components/shared/PageTransition";
import { useAuth } from "@/lib/contexts/auth.context";
import type { Post, BrandFilter } from "@/types";
import {
  subscribeToPosts,
  subscribeToPostsByBrand,
} from "@/lib/firebase/posts.service";

const brands: BrandFilter[] = ["All", "Nike", "Adidas", "Jordan", "New Balance", "Other"];

export const DashboardPage = () => {
  const { currentUser } = useAuth();
  const [selectedBrand, setSelectedBrand] = useState<BrandFilter>("All");
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [addSneakerOpen, setAddSneakerOpen] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const handlePosts = (fetchedPosts: Post[]) => {
      setPosts(fetchedPosts);
      setLoading(false);
    };
    const handleError = () => {
      setError("Failed to load sneakers");
      setLoading(false);
    };

    const unsubscribe =
      selectedBrand === "All"
        ? subscribeToPosts(handlePosts, handleError)
        : subscribeToPostsByBrand(selectedBrand, handlePosts, handleError);

    return () => unsubscribe?.();
  }, [selectedBrand]);

  // Hide posts where the current user is the sole owner
  const visiblePosts = posts.filter((post) => {
    if (!currentUser) return true;
    const owners = post.owners ?? [];
    if (owners.length === 0) return true;
    return !(owners.length === 1 && owners[0].userId === currentUser.uid);
  });

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        <Navbar />

        <main className="pt-24 md:pt-20 pb-24 md:pb-10 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">

            {/* Header */}
            <div className="mb-6 pt-4">
              <h1 className="text-3xl font-bold text-foreground">Discover</h1>
              <p className="text-muted-foreground mt-1">Browse sneakers available for trade</p>
            </div>

            {/* Brand filter — horizontal scroll pills */}
            <div className="mb-6 -mx-4 px-4 overflow-x-auto scrollbar-hide">
              <div className="flex gap-2 min-w-max pb-1">
                {brands.map((brand) => (
                  <button
                    key={brand}
                    onClick={() => setSelectedBrand(brand)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                      selectedBrand === brand
                        ? "bg-[#3366FF] text-white shadow-md shadow-[#3366FF]/25"
                        : "bg-card text-foreground border border-border hover:border-[#3366FF]/50"
                    }`}
                  >
                    {brand}
                  </button>
                ))}
              </div>
            </div>

            {/* Results count */}
            {!loading && !error && (
              <p className="text-sm text-muted-foreground mb-5">
                {visiblePosts.length} {visiblePosts.length === 1 ? "sneaker" : "sneakers"} available
              </p>
            )}

            {/* Error */}
            {error && (
              <div className="text-center py-16">
                <p className="text-destructive mb-3">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="text-sm text-[#3366FF] hover:underline"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Loading skeleton */}
            {loading && !error && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="bg-white dark:bg-card rounded-2xl overflow-hidden animate-pulse shadow-[0_2px_16px_rgba(0,0,0,0.07)]">
                    <div className="aspect-square bg-gray-100 dark:bg-muted" />
                    <div className="p-4 space-y-2.5">
                      <div className="h-2.5 bg-muted rounded-full w-1/3" />
                      <div className="h-3.5 bg-muted rounded-full w-full" />
                      <div className="h-3.5 bg-muted rounded-full w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Sneaker grid */}
            {!loading && !error && visiblePosts.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {visiblePosts.map((post) => (
                  <SneakerCard
                    key={post.postId}
                    post={post}
                    onClick={() => setSelectedPost(post)}
                  />
                ))}
              </div>
            )}

            {/* Empty */}
            {!loading && !error && visiblePosts.length === 0 && (
              <div className="text-center py-16">
                <p className="text-foreground font-semibold mb-1">No sneakers found</p>
                <p className="text-sm text-muted-foreground">
                  {selectedBrand === "All"
                    ? "Be the first to add a sneaker!"
                    : `Try a different brand or add some ${selectedBrand} sneakers`}
                </p>
              </div>
            )}
          </div>
        </main>

        {/* FAB */}
        <button
          onClick={() => setAddSneakerOpen(true)}
          className="hidden md:flex fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg hover:scale-110 transition-all items-center justify-center z-40 bg-gradient-to-br from-[#3366FF] to-[#33FF99]"
        >
          <Plus className="w-6 h-6 text-white" />
        </button>

        {selectedPost && (
          <PostDetailModal
            open={!!selectedPost}
            onClose={() => setSelectedPost(null)}
            post={selectedPost}
          />
        )}

        <AddSneakerDialog
          open={addSneakerOpen}
          onClose={() => setAddSneakerOpen(false)}
        />
      </div>
    </PageTransition>
  );
};

function SneakerCard({ post, onClick }: { post: Post; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group text-left bg-white dark:bg-card rounded-2xl overflow-hidden
        shadow-[0_2px_16px_rgba(0,0,0,0.07)]
        hover:shadow-[0_12px_40px_rgba(0,0,0,0.13)]
        hover:-translate-y-1
        transition-all duration-200"
    >
      <div className="relative aspect-square bg-muted overflow-hidden">
        <img
          src={post.productImageUrl}
          alt={post.title}
          className="absolute inset-0 w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-300"
          referrerPolicy="no-referrer"
        />
      </div>
      <div className="px-4 pt-3.5 pb-4">
        <p className="text-[11px] font-bold text-[#3366FF] mb-1.5 uppercase tracking-widest">
          {post.brand}
        </p>
        <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
          {post.title}
        </h3>
      </div>
    </button>
  );
}

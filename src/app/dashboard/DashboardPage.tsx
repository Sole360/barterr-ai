import { useState } from "react";
import { Navbar } from "@/components/shared/Navbar";
import { PostDetailModal } from "@/components/dialogs/PostDetailModal";
import { Post } from "@/types";
import { AddSneakerDialog } from "@/components/dialogs/AddSneakerDialog";
import { Plus } from "lucide-react";

type BrandFilter =
  | "All"
  | "Nike"
  | "Adidas"
  | "Jordan"
  | "New Balance"
  | "Other";

export function DashboardPage() {
  const [selectedBrand, setSelectedBrand] = useState<BrandFilter>("All");
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [addSneakerOpen, setAddSneakerOpen] = useState(false);

  const dummyPosts: Post[] = [
    {
      postId: "1",
      title: "Air Jordan 1 Retro High OG",
      brand: "Jordan",
      productImageUrl:
        "https://images.unsplash.com/photo-1584735175097-719d848f8449?w=400&h=300&fit=crop",
    },
    {
      postId: "2",
      title: "Yeezy Boost 350 V2",
      brand: "Adidas",
      productImageUrl:
        "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=400&h=300&fit=crop",
    },
    {
      postId: "3",
      title: "Nike Dunk Low Panda",
      brand: "Nike",
      productImageUrl:
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=300&fit=crop",
    },
    {
      postId: "4",
      title: "New Balance 550",
      brand: "New Balance",
      productImageUrl:
        "https://images.unsplash.com/photo-1539185441755-769473a23570?w=400&h=300&fit=crop",
    },
    {
      postId: "5",
      title: "Air Max 90",
      brand: "Nike",
      productImageUrl:
        "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400&h=300&fit=crop",
    },
    {
      postId: "6",
      title: "Travis Scott Jordan 1",
      brand: "Jordan",
      productImageUrl:
        "https://images.unsplash.com/photo-1552346154-21d32810aba3?w=400&h=300&fit=crop",
    },
  ];

  const filteredPosts =
    selectedBrand === "All"
      ? dummyPosts
      : dummyPosts.filter((post) => post.brand === selectedBrand);

  const brands: BrandFilter[] = [
    "All",
    "Nike",
    "Adidas",
    "Jordan",
    "New Balance",
    "Other",
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="pt-20 pb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Discover</h1>
            <p className="text-gray-600">Browse sneakers available for trade</p>
          </div>

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

          <div className="mb-4">
            <p className="text-sm text-gray-600">
              {filteredPosts.length}{" "}
              {filteredPosts.length === 1 ? "sneaker" : "sneakers"} available
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
            {filteredPosts.map((post) => (
              <div
                key={post.postId}
                onClick={() => setSelectedPost(post)}
                className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden cursor-pointer"
              >
                <div className="aspect-[4/3] bg-gray-100 overflow-hidden">
                  <img
                    src={post.productImageUrl}
                    alt={post.title}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
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

          {filteredPosts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-2">No sneakers found</p>
              <p className="text-sm text-gray-400">
                Try selecting a different brand
              </p>
            </div>
          )}
        </div>
      </main>
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
}

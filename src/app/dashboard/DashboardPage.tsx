import { useState } from "react";
import { Navbar } from "@/components/shared/Navbar";

type BrandFilter =
  | "All"
  | "Nike"
  | "Adidas"
  | "Jordan"
  | "New Balance"
  | "Other";

export function DashboardPage() {
  const [selectedBrand, setSelectedBrand] = useState<BrandFilter>("All");

  // Dummy sneaker posts
  const dummyPosts = [
    {
      id: "1",
      title: "Air Jordan 1 Retro High OG",
      brand: "Jordan",
      imageUrl:
        "https://images.unsplash.com/photo-1584735175097-719d848f8449?w=400&h=300&fit=crop",
      size: 10.5,
      condition: 9,
    },
    {
      id: "2",
      title: "Yeezy Boost 350 V2",
      brand: "Adidas",
      imageUrl:
        "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=400&h=300&fit=crop",
      size: 11,
      condition: 8,
    },
    {
      id: "3",
      title: "Nike Dunk Low Panda",
      brand: "Nike",
      imageUrl:
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=300&fit=crop",
      size: 9,
      condition: 10,
    },
    {
      id: "4",
      title: "New Balance 550",
      brand: "New Balance",
      imageUrl:
        "https://images.unsplash.com/photo-1539185441755-769473a23570?w=400&h=300&fit=crop",
      size: 10,
      condition: 9,
    },
    {
      id: "5",
      title: "Air Max 90",
      brand: "Nike",
      imageUrl:
        "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400&h=300&fit=crop",
      size: 11,
      condition: 8,
    },
    {
      id: "6",
      title: "Travis Scott Jordan 1",
      brand: "Jordan",
      imageUrl:
        "https://images.unsplash.com/photo-1552346154-21d32810aba3?w=400&h=300&fit=crop",
      size: 10,
      condition: 9,
    },
  ];

  // Filter posts by brand
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

      {/* Main Content */}
      <main className="pt-20 pb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Page Header */}
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
              {filteredPosts.length}{" "}
              {filteredPosts.length === 1 ? "sneaker" : "sneakers"} available
            </p>
          </div>

          {/* Sneaker Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
            {filteredPosts.map((post) => (
              <div
                key={post.id}
                className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden cursor-pointer"
              >
                {/* Image */}
                <div className="aspect-[4/3] bg-gray-100 overflow-hidden">
                  <img
                    src={post.imageUrl}
                    alt={post.title}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                  />
                </div>

                {/* Content */}
                <div className="p-4">
                  <p className="text-xs font-medium text-[#3366FF] mb-1">
                    {post.brand}
                  </p>
                  <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                    {post.title}
                  </h3>

                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>Size {post.size}</span>
                    <span className="flex items-center">
                      <span className="text-yellow-400 mr-1">★</span>
                      {post.condition}/10
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Empty State */}
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
    </div>
  );
}

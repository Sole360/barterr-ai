import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Heart, Star, MapPin, Clock } from "lucide-react";
import { Listing, Post } from "@/types";
import { Timestamp } from "firebase/firestore";

interface PostDetailModalProps {
  open: boolean;
  onClose: () => void;
  post: Post;
}

export function PostDetailModal({ open, onClose, post }: PostDetailModalProps) {
  const [selectedSize, setSelectedSize] = useState<number>(10);
  const [selectedCondition, setSelectedCondition] = useState<"new" | "used">(
    "new"
  );
  const [isWishlisted, setIsWishlisted] = useState(false);

  // Dummy data - will be replaced with real data later
  const availableSizes = [8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12];

  const dummyListings: Listing[] = [
    {
      id: "1",
      postId: post.postId,
      userId: "user1",
      userName: "John D.",
      userRating: 4.9,
      size: 10,
      condition: "new",
      conditionGrade: 10,
      tradeValue: 175,
      location: "Los Angeles, CA",
      responseTime: "Usually responds in 2 hours",
      createdAt: Timestamp.now(),
    },
    {
      id: "2",
      postId: post.postId,
      userId: "user2",
      userName: "Sarah M.",
      userRating: 5.0,
      size: 10,
      condition: "new",
      conditionGrade: 10,
      tradeValue: 180,
      location: "New York, NY",
      responseTime: "Usually responds in 1 hour",
      createdAt: Timestamp.now(),
    },
    {
      id: "3",
      postId: post.postId,
      userId: "user3",
      userName: "Mike R.",
      userRating: 4.7,
      size: 10,
      condition: "used",
      conditionGrade: 9,
      tradeValue: 150,
      location: "Chicago, IL",
      responseTime: "Usually responds in 3 hours",
      createdAt: Timestamp.now(),
    },
  ];

  // Filter listings by selected size and condition
  const filteredListings = dummyListings.filter(
    (listing) =>
      listing.size === selectedSize && listing.condition === selectedCondition
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        {/* Hero Image */}
        <div className="relative aspect-[4/3] bg-gray-100">
          <img
            src={post.productImageUrl}
            alt={post.title}
            className="w-full h-full object-cover"
          />
          <button
            onClick={() => setIsWishlisted(!isWishlisted)}
            className="absolute top-4 right-4 p-2 bg-white rounded-full shadow-md hover:scale-110 transition-transform"
          >
            <Heart
              className={`w-6 h-6 ${
                isWishlisted ? "fill-red-500 text-red-500" : "text-gray-600"
              }`}
            />
          </button>
        </div>

        <div className="p-6">
          {/* Product Info */}
          <DialogHeader className="mb-6">
            <p className="text-sm font-medium text-[#3366FF] mb-1">
              {post.brand}
            </p>
            <DialogTitle className="text-2xl font-bold text-gray-900">
              {post.title}
            </DialogTitle>
          </DialogHeader>

          {/* Size Selector */}
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-3">
              Select Size (US)
            </p>
            <div className="flex flex-wrap gap-2">
              {availableSizes.map((size) => (
                <button
                  key={size}
                  onClick={() => setSelectedSize(size)}
                  className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                    selectedSize === size
                      ? "border-[#3366FF] bg-[#3366FF] text-white"
                      : "border-gray-200 text-gray-700 hover:border-gray-300"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Condition Tabs */}
          <div className="mb-6">
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setSelectedCondition("new")}
                className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                  selectedCondition === "new"
                    ? "border-[#3366FF] text-[#3366FF]"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                New (Deadstock)
              </button>
              <button
                onClick={() => setSelectedCondition("used")}
                className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                  selectedCondition === "used"
                    ? "border-[#3366FF] text-[#3366FF]"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Used
              </button>
            </div>
          </div>

          {/* Listings */}
          <div className="space-y-4">
            <p className="text-sm font-medium text-gray-700">
              {filteredListings.length}{" "}
              {filteredListings.length === 1 ? "listing" : "listings"} available
            </p>

            {filteredListings.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No listings available for this size and condition</p>
                <p className="text-sm mt-2">
                  Try selecting a different size or condition
                </p>
              </div>
            ) : (
              filteredListings.map((listing) => (
                <div
                  key={listing.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-[#3366FF] transition-colors"
                >
                  {/* Listing Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="font-semibold text-lg text-gray-900">
                          ${listing.tradeValue}
                        </span>
                        <span className="text-sm text-gray-500">
                          Trade Value
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-700">
                          {listing.userName}
                        </span>
                        <div className="flex items-center">
                          <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                          <span className="text-sm text-gray-600 ml-1">
                            {listing.userRating}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                        {listing.condition === "new"
                          ? "Deadstock"
                          : `${listing.conditionGrade}/10`}
                      </span>
                    </div>
                  </div>

                  {/* Listing Details */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center text-sm text-gray-600">
                      <MapPin className="w-4 h-4 mr-2" />
                      {listing.location}
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <Clock className="w-4 h-4 mr-2" />
                      {listing.responseTime}
                    </div>
                  </div>

                  {/* Action Button */}
                  <Button
                    className="w-full bg-[#3366FF] hover:bg-[#3366FF]/90"
                    onClick={() => {
                      // Handle trade request
                      console.log("Request trade with:", listing.userId);
                    }}
                  >
                    Request Trade
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

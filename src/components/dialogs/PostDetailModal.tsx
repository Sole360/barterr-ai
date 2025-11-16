// COMPLETE UPDATED src/components/dialogs/PostDetailModal.tsx

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Heart, Star, MapPin, Clock, X } from "lucide-react";
import { Listing, Post } from "@/types";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  subscribeToListings,
  addToWishlist,
  removeFromWishlist,
  addToCollection,
} from "@/lib/firebase/posts.service";

interface PostDetailModalProps {
  open: boolean;
  onClose: () => void;
  post: Post;
}

export function PostDetailModal({ open, onClose, post }: PostDetailModalProps) {
  const { currentUser, userProfile } = useAuth();
  const { toast } = useToast();

  const [selectedSize, setSelectedSize] = useState<number>(
    userProfile?.shoeSize ?? 10
  );
  const [selectedCondition, setSelectedCondition] = useState<"new" | "used">(
    "new"
  );
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);

  const availableSizes = [
    3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12,
    12.5, 13, 14, 15, 16, 17, 18,
  ];

  // Check if current user is in wishlist
  useEffect(() => {
    if (!currentUser || !post.wishers) {
      setIsWishlisted(false);
      return;
    }

    const inWishlist = post.wishers.some((w) => w.userId === currentUser.uid);
    setIsWishlisted(inWishlist);
  }, [currentUser, post.wishers]);

  // Subscribe to real listings
  useEffect(() => {
    const unsubscribe = subscribeToListings(
      post.postId,
      (fetchedListings) => {
        setListings(fetchedListings);
      },
      { size: selectedSize, condition: selectedCondition }
    );

    return () => unsubscribe();
  }, [post.postId, selectedSize, selectedCondition]);

  const handleWishlistToggle = async () => {
    if (!currentUser || !userProfile) {
      toast({
        title: "Login required",
        description: "Please login to add to wishlist",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      if (isWishlisted) {
        await removeFromWishlist(
          post.postId,
          currentUser.uid,
          post.wishers ?? []
        );
        toast({ title: "Removed from wishlist" });
      } else {
        await addToWishlist(
          post.postId,
          currentUser.uid,
          `${userProfile.firstName} ${userProfile.lastName}`,
          userProfile.email,
          userProfile.photoURL ?? "",
          selectedSize
        );
        toast({ title: "Added to wishlist ❤️" });
      }
    } catch (error) {
      console.error("Wishlist error:", error);
      toast({
        title: "Error",
        description: "Failed to update wishlist",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCollection = async () => {
    if (!currentUser || !userProfile) {
      toast({
        title: "Login required",
        description: "Please login to add to collection",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await addToCollection(
        post.postId,
        currentUser.uid,
        `${userProfile.firstName} ${userProfile.lastName}`,
        userProfile.email,
        userProfile.photoURL ?? "",
        selectedSize,
        selectedCondition === "new" ? 10 : 8,
        0, // tradeValue - user can update later
        userProfile.location ?? "Location not set"
      );

      toast({
        title: "Added to collection! 🎉",
        description: "Your sneaker is now available for trading",
      });

      onClose();
    } catch (error) {
      console.error("Collection error:", error);
      toast({
        title: "Error",
        description: "Failed to add to collection",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 bg-white [&>button]:hidden">
        {/* Hero Image */}
        <div className="relative aspect-[4/3] bg-gray-100">
          <img
            src={post.productImageUrl}
            alt={post.title}
            className="w-full h-full object-contain"
            referrerPolicy="no-referrer"
          />

          {/* Buttons stacked vertically in top-right */}
          <div className="absolute top-4 right-4 flex flex-col gap-2">
            <button
              onClick={onClose}
              className="p-2 bg-white rounded-full shadow-md hover:scale-110 transition-transform"
            >
              <X className="w-6 h-6 text-gray-600" />
            </button>

            <button
              onClick={handleWishlistToggle}
              disabled={loading}
              className="p-2 bg-white rounded-full shadow-md hover:scale-110 transition-transform disabled:opacity-50"
            >
              <Heart
                className={`w-6 h-6 ${
                  isWishlisted ? "fill-red-500 text-red-500" : "text-gray-600"
                }`}
              />
            </button>
          </div>
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

          {/* Add to Collection Button */}
          <div className="mb-6">
            <Button
              onClick={handleAddToCollection}
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#33FF99] to-[#3366FF] hover:opacity-90 h-12 text-white font-semibold"
            >
              Add to My Collection
            </Button>
          </div>

          {/* Listings */}
          <div className="space-y-4">
            <p className="text-sm font-medium text-gray-700">
              {listings.length} {listings.length === 1 ? "listing" : "listings"}{" "}
              available
            </p>

            {listings.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No listings available for this size and condition</p>
                <p className="text-sm mt-2">
                  Try selecting a different size or condition
                </p>
              </div>
            ) : (
              listings.map((listing) => (
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
                      // TODO: Handle trade request - Phase 6
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

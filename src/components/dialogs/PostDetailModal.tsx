// src/components/dialogs/PostDetailModal.tsx - CLEANED UP

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Heart,
  Star,
  MapPin,
  Clock,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Listing, Post } from "@/types";
import { useAuth } from "@/lib/contexts/auth.context";
import { useToast } from "@/hooks/use-toast";
import {
  subscribeToListings,
  addToWishlist,
  removeFromWishlist,
} from "@/lib/firebase/posts.service";
import { useNavigate } from "react-router-dom";

interface PostDetailModalProps {
  open: boolean;
  onClose: () => void;
  post: Post;
}

export const PostDetailModal = ({ open, onClose, post }: PostDetailModalProps) => {
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
    if (!currentUser) {
      setIsWishlisted(false);
      return;
    }

    const wishers = post.wishers ?? [];
    const inWishlist = wishers.some(
      (w) => w.userId === currentUser.uid && w.size === selectedSize
    );

    setIsWishlisted(inWishlist);
  }, [currentUser, currentUser?.uid, post.wishers, selectedSize]);

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

    const was = isWishlisted;
    setIsWishlisted(!was); // instant fill/unfill
    setLoading(true);

    try {
      if (was) {
        await removeFromWishlist(
          post.postId,
          currentUser.uid,
          selectedSize,
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
    } catch (e) {
      setIsWishlisted(was); // revert
      toast({
        title: "Error",
        description: `Failed to update wishlist: ${e}`,
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
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  showPhotos={selectedCondition === "used"}
                  post={post}
                />
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Separate component for listing cards with photo carousel
function ListingCard({
  listing,
  showPhotos,
  post,
}: {
  listing: Listing;
  showPhotos: boolean;
  post: Post;
}) {
  const { currentUser, userProfile } = useAuth();
  const { toast } = useToast();
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const navigate = useNavigate();

  const photos = listing.photos
    ? Object.values(listing.photos).filter(Boolean)
    : [];

  const nextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + 1) % photos.length);
  };

  const prevPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:border-[#3366FF] transition-colors">
      {/* Photo Carousel for Used Listings */}
      {showPhotos && photos.length > 0 && (
        <div className="mb-4">
          <div className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
            <img
              src={photos[currentPhotoIndex]}
              alt={`Photo ${currentPhotoIndex + 1}`}
              className="w-full h-full object-cover"
            />

            {photos.length > 1 && (
              <>
                <button
                  onClick={prevPhoto}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1 bg-white/80 rounded-full hover:bg-white"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={nextPhoto}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 bg-white/80 rounded-full hover:bg-white"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>

                {/* Photo indicator dots */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                  {photos.map((_, idx) => (
                    <div
                      key={idx}
                      className={`w-1.5 h-1.5 rounded-full ${
                        idx === currentPhotoIndex ? "bg-white" : "bg-white/50"
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* Listing Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <span className="font-semibold text-lg text-gray-900">
              ${listing.tradeValue}
            </span>
            <span className="text-sm text-gray-500">Trade Value</span>
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
          if (!currentUser?.uid || !userProfile) {
            toast({
              title: "Login required",
              description: "Please login to request a trade",
              variant: "destructive",
            });
            return;
          }

          if (currentUser.uid === listing.userId) {
            toast({
              title: "Not allowed",
              description: "You can't request a trade with yourself",
              variant: "destructive",
            });
            return;
          }

          navigate(`/trades/new?postId=${post.postId}&listingId=${listing.id}`);
        }}
      >
        Request Trade
      </Button>
    </div>
  );
};

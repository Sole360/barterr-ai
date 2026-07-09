import { useState, useEffect } from "react";
import { Drawer } from "vaul";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Heart, Star, MapPin, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Listing, Post } from "@/types";
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

const availableSizes = [
  3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5,
  12, 12.5, 13, 14, 15, 16, 17, 18,
];

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 768
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

// ─── Shared body ──────────────────────────────────────────────────────────────

function PostDetailBody({ post }: { post: Post }) {
  const { currentUser, userProfile } = useAuth();
  const { toast } = useToast();

  const [selectedSize, setSelectedSize] = useState<number>(
    userProfile?.shoeSize ?? 10
  );
  const [selectedCondition, setSelectedCondition] = useState<"new" | "used">("new");
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentUser) { setIsWishlisted(false); return; }
    setIsWishlisted(
      (post.wishers ?? []).some(
        (w) => w.userId === currentUser.uid && w.size === selectedSize
      )
    );
  }, [currentUser, post.wishers, selectedSize]);

  useEffect(() => {
    const unsub = subscribeToListings(
      post.postId,
      (l) => setListings(l),
      { size: selectedSize, condition: selectedCondition }
    );
    return () => unsub();
  }, [post.postId, selectedSize, selectedCondition]);

  const handleWishlistToggle = async () => {
    if (!currentUser || !userProfile) {
      toast({ title: "Login required", description: "Please login to add to wishlist", variant: "destructive" });
      return;
    }
    const was = isWishlisted;
    setIsWishlisted(!was);
    setLoading(true);
    try {
      if (was) {
        await removeFromWishlist(post.postId, currentUser.uid, selectedSize, post.wishers ?? []);
        toast({ title: "Removed from wishlist" });
      } else {
        await addToWishlist(
          post.postId, currentUser.uid,
          `${userProfile.firstName} ${userProfile.lastName}`,
          userProfile.email, userProfile.photoURL ?? "", selectedSize
        );
        toast({ title: "Added to wishlist" });
      }
    } catch {
      setIsWishlisted(was);
      toast({ title: "Error", description: "Failed to update wishlist", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Hero image — absolute positioning is bulletproof for image rendering */}
      <div className="relative h-64 bg-gray-50 dark:bg-muted mx-4 mt-4 rounded-2xl overflow-hidden">
        <img
          src={post.productImageUrl}
          alt={post.title}
          className="absolute inset-0 w-full h-full object-contain p-6"
          referrerPolicy="no-referrer"
        />
        <button
          onClick={handleWishlistToggle}
          disabled={loading}
          className="absolute top-3 right-3 p-2.5 bg-background/90 backdrop-blur-sm rounded-full shadow hover:scale-110 transition-transform disabled:opacity-50"
        >
          <Heart className={`w-5 h-5 ${isWishlisted ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
        </button>
      </div>

      <div className="px-5 pt-5 pb-8">
        {/* Title */}
        <p className="text-xs font-bold text-[#3366FF] uppercase tracking-widest mb-1">{post.brand}</p>
        <p className="text-xl font-bold text-foreground leading-snug mb-5">{post.title}</p>

        {/* Size — single horizontal scroll row */}
        <div className="mb-6">
          <p className="text-sm font-semibold text-foreground mb-3">Size (US)</p>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
            {availableSizes.map((size) => (
              <button
                key={size}
                onClick={() => setSelectedSize(size)}
                className={`flex-shrink-0 w-14 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                  selectedSize === size
                    ? "border-[#3366FF] bg-[#3366FF] text-white"
                    : "border-border bg-background text-foreground hover:border-[#3366FF]/50"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        {/* Condition */}
        <div className="mb-6 flex border-b border-border">
          {(["new", "used"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setSelectedCondition(c)}
              className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${
                selectedCondition === c
                  ? "border-[#3366FF] text-[#3366FF]"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {c === "new" ? "New (Deadstock)" : "Used"}
            </button>
          ))}
        </div>

        {/* Listings */}
        <p className="text-sm text-muted-foreground mb-4">
          {listings.length} {listings.length === 1 ? "listing" : "listings"} available
        </p>
        {listings.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <p className="font-medium">No listings for this size &amp; condition</p>
            <p className="text-sm mt-1">Try a different size or condition</p>
          </div>
        ) : (
          <div className="space-y-4">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                showPhotos={selectedCondition === "used"}
                post={post}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Responsive wrapper ───────────────────────────────────────────────────────

export const PostDetailModal = ({ open, onClose, post }: PostDetailModalProps) => {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-[540px] max-h-[88vh] overflow-y-auto rounded-2xl bg-background shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <DialogPrimitive.Title className="sr-only">{post.title}</DialogPrimitive.Title>
            <PostDetailBody post={post} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-[24px] bg-background max-h-[92dvh] focus:outline-none">
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/25" />
          </div>
          <Drawer.Title className="sr-only">{post.title}</Drawer.Title>
          <div className="overflow-y-auto flex-1">
            <PostDetailBody post={post} />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
};

// ─── Listing card ─────────────────────────────────────────────────────────────

function ListingCard({ listing, showPhotos, post }: { listing: Listing; showPhotos: boolean; post: Post }) {
  const { currentUser, userProfile } = useAuth();
  const { toast } = useToast();
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const navigate = useNavigate();

  const photos = listing.photos ? Object.values(listing.photos).filter(Boolean) : [];

  return (
    <div className="border border-border rounded-2xl p-4 bg-card">
      {showPhotos && photos.length > 0 && (
        <div className="mb-4 relative aspect-square bg-muted rounded-xl overflow-hidden">
          <img src={photos[currentPhotoIndex]} alt={`Photo ${currentPhotoIndex + 1}`} className="absolute inset-0 w-full h-full object-cover" />
          {photos.length > 1 && (
            <>
              <button onClick={() => setCurrentPhotoIndex((p) => (p - 1 + photos.length) % photos.length)} className="absolute left-2 top-1/2 -translate-y-1/2 p-1 bg-background/80 rounded-full"><ChevronLeft className="w-5 h-5" /></button>
              <button onClick={() => setCurrentPhotoIndex((p) => (p + 1) % photos.length)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 bg-background/80 rounded-full"><ChevronRight className="w-5 h-5" /></button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                {photos.map((_, idx) => <div key={idx} className={`w-1.5 h-1.5 rounded-full ${idx === currentPhotoIndex ? "bg-white" : "bg-white/50"}`} />)}
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-lg text-foreground">${listing.tradeValue}</span>
            <span className="text-sm text-muted-foreground">Trade Value</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{listing.userName}</span>
            <div className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
              <span className="text-xs text-muted-foreground">{listing.userRating}</span>
            </div>
          </div>
        </div>
        <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-xs font-semibold rounded-full">
          {listing.condition === "new" ? "Deadstock" : `${listing.conditionGrade}/10`}
        </span>
      </div>

      <div className="space-y-1.5 mb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="w-4 h-4 flex-shrink-0" />{listing.location}</div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="w-4 h-4 flex-shrink-0" />{listing.responseTime}</div>
      </div>

      <Button
        className="w-full bg-[#3366FF] hover:bg-[#3366FF]/90 text-white rounded-xl"
        onClick={() => {
          if (!currentUser?.uid || !userProfile) {
            toast({ title: "Login required", description: "Please login to request a trade", variant: "destructive" });
            return;
          }
          if (currentUser.uid === listing.userId) {
            toast({ title: "Not allowed", description: "You can't request a trade with yourself", variant: "destructive" });
            return;
          }
          navigate(`/trades/new?postId=${post.postId}&listingId=${listing.id}`);
        }}
      >
        Request Trade
      </Button>
    </div>
  );
}

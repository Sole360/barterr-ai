import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { ProfileHeader } from "./ProfileHeader";
import { ProfileTabs } from "./ProfileTabs";
import { CollectionGrid } from "./CollectionGrid";
import { AddSneakerDialog } from "@/components/dialogs/AddSneakerDialog";
import { PageTransition } from "@/components/shared/PageTransition";
import { Navbar } from "@/components/shared/Navbar";
import { useAuth } from "@/lib/contexts/auth.context";
import { useMyCollection } from "@/lib/firebase/useMyCollection";
import { useMyWishlist } from "@/lib/firebase/useMyWishlist";
import { MyListingModal } from "@/components/dialogs/MyListingModal";
import { EditProfileDialog } from "@/components/dialogs/EditProfileDialog";
import { MyWishlistModal } from "@/components/dialogs/MyWishlistModal";
import { db, storage } from "@/lib/firebase/config";
import { useToast } from "@/hooks/use-toast";
import type { ProfileTabKey } from "@/types";

export const ProfilePage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [tab, setTab] = useState<ProfileTabKey>("collection");
  const [addOpen, setAddOpen] = useState(false);
  const { currentUser, userProfile } = useAuth();
  const { items, loading } = useMyCollection(currentUser?.uid);

  const [editListingId, setEditListingId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  const { items: wishlistItems, loading: wishlistLoading } = useMyWishlist(currentUser?.uid);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [wishlistPostId, setWishlistPostId] = useState<string | null>(null);
  const [wishlistSize, setWishlistSize] = useState<number>(0);

  // Wishlist items grouped by post
  const wishlistedByPost = useMemo(() => {
    const map = new Map<string, { postId: string; name: string; brand?: string; imageUrl?: string; sizes: number[] }>();
    for (const w of wishlistItems) {
      const existing = map.get(w.postId);
      if (!existing) {
        map.set(w.postId, { postId: w.postId, name: w.name, brand: w.brand, imageUrl: w.imageUrl, sizes: [w.size] });
      } else if (!existing.sizes.some((s) => Number(s) === Number(w.size))) {
        existing.sizes.push(w.size);
      }
    }
    return Array.from(map.values()).map((g) => ({ ...g, sizes: g.sizes.map(Number).sort((a, b) => a - b) }));
  }, [wishlistItems]);

  // Auto-derive brand tags from wishlist
  const autoBrandTags = useMemo(() => {
    const brands = new Set<string>();
    for (const g of wishlistedByPost) {
      if (g.brand) brands.add(g.brand);
    }
    return Array.from(brands);
  }, [wishlistedByPost]);

  // Cover photo upload — happens directly without opening edit dialog
  const handleCoverPhotoChange = async (file: File) => {
    if (!currentUser?.uid) return;
    try {
      const coverRef = ref(storage, `users/${currentUser.uid}/cover`);
      await uploadBytes(coverRef, file, { contentType: file.type });
      const url = await getDownloadURL(coverRef);
      await updateDoc(doc(db, "users", currentUser.uid), { coverPhoto: url });
      toast({ title: "Cover photo updated" });
    } catch {
      toast({ title: "Error", description: "Failed to update cover photo", variant: "destructive" });
    }
  };

  const gridItems = items.map((item) => ({
    id: item.id,
    postId: item.postId,
    name: item.name,
    size: item.size,
    value: item.value,
    imageUrl: item.imageUrl,
    status: item.status,
  }));

  const collectionCount = items.length;
  const wishlistCount = wishlistItems.length;
  const tradesCount = 0;

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-16 md:pt-16">
        <ProfileHeader
          displayName={userProfile?.displayName ?? currentUser?.displayName ?? "Your Profile"}
          location={userProfile?.location}
          rating={5}
          bio={userProfile?.biography}
          avatarUrl={userProfile?.photoURL ?? ""}
          coverPhoto={userProfile?.coverPhoto}
          styleTags={userProfile?.styleTags}
          autoBrandTags={autoBrandTags}
          onNavigateBack={() => navigate(-1)}
          onSettingsClick={() => setEditProfileOpen(true)}
          onCoverPhotoChange={handleCoverPhotoChange}
          stats={{ collectionCount, wishlistCount, tradesCount }}
        />

        {/* Content */}
        <div className="max-w-4xl mx-auto px-4 pb-24 md:pb-10">
          <ProfileTabs value={tab} onValueChange={setTab} />

          <div className="mt-5">
            {tab === "collection" ? (
              loading ? (
                <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                  Loading your collection…
                </div>
              ) : (
                <CollectionGrid
                  items={gridItems}
                  onAddToCollection={() => setAddOpen(true)}
                  onSelectItem={(gridItem) => {
                    setEditListingId(gridItem.id);
                    setEditOpen(true);
                  }}
                />
              )
            ) : tab === "wishlist" ? (
              wishlistLoading ? (
                <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                  Loading your wishlist…
                </div>
              ) : wishlistedByPost.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                  Your wishlist is empty.
                </div>
              ) : (
                <WishlistGrid
                  groups={wishlistedByPost}
                  onSelectSize={(postId, size) => {
                    setWishlistPostId(postId);
                    setWishlistSize(size);
                    setWishlistOpen(true);
                  }}
                />
              )
            ) : tab === "fashion" ? (
              <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                Fashion Photos — coming soon
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                Recent Trades — coming soon
              </div>
            )}
          </div>
        </div>

        </div>{/* end pt-32 wrapper */}

        <AddSneakerDialog open={addOpen} onClose={() => setAddOpen(false)} />

        <EditProfileDialog
          open={editProfileOpen}
          onClose={() => setEditProfileOpen(false)}
        />

        {editListingId && (
          <MyListingModal
            open={editOpen}
            listingId={editListingId}
            onClose={() => { setEditOpen(false); setEditListingId(null); }}
          />
        )}

        {wishlistPostId && (
          <MyWishlistModal
            open={wishlistOpen}
            postId={wishlistPostId}
            size={wishlistSize}
            onClose={() => { setWishlistOpen(false); setWishlistPostId(null); setWishlistSize(0); }}
          />
        )}
      </div>
    </PageTransition>
  );
};

// ─── Wishlist grid ────────────────────────────────────────────────────────────

const WishlistGrid = ({
  groups,
  onSelectSize,
}: {
  groups: { postId: string; name: string; brand?: string; imageUrl?: string; sizes: number[] }[];
  onSelectSize: (postId: string, size: number) => void;
}) => (
  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
    {groups.map((g) => (
      <div
        key={g.postId}
        className="rounded-2xl bg-card overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.07)]"
      >
        <div className="relative aspect-square bg-muted">
          {g.imageUrl && (
            <img
              src={g.imageUrl}
              alt={g.name}
              className="absolute inset-0 w-full h-full object-contain p-4"
              referrerPolicy="no-referrer"
            />
          )}
        </div>
        <div className="p-3.5">
          {g.brand && (
            <div className="text-[11px] font-bold text-[#3366FF] uppercase tracking-widest mb-1">
              {g.brand}
            </div>
          )}
          <div className="text-sm font-semibold text-foreground line-clamp-2 mb-2.5">{g.name}</div>
          <div className="flex flex-wrap gap-1.5">
            {g.sizes.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => onSelectSize(g.postId, size)}
                className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-foreground hover:border-[#3366FF] hover:text-[#3366FF] transition-colors"
              >
                US {size}
              </button>
            ))}
          </div>
        </div>
      </div>
    ))}
  </div>
);

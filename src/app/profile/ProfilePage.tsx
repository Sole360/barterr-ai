import { useMemo, useState } from "react";
import { ProfileHeader } from "./ProfileHeader";
import { ProfileTabs, type ProfileTabKey } from "./ProfileTabs";
import { CollectionGrid } from "./CollectionGrid";
import { AddSneakerDialog } from "@/components/dialogs/AddSneakerDialog";
import { useAuth } from "@/lib/contexts/auth.context";
import { useMyCollection } from "@/lib/firebase/useMyCollection";
import { useMyWishlist } from "@/lib/firebase/useMyWishlist";
import { MyListingModal } from "@/components/dialogs/MyListingModal";
import { EditProfileDialog } from "@/components/dialogs/EditProfileDialog";
import { MyWishlistModal } from "@/components/dialogs/MyWishlistModal";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const ProfilePage = () => {
  const navigate = useNavigate();

  const [tab, setTab] = useState<ProfileTabKey>("collection");
  const [addOpen, setAddOpen] = useState(false);
  const { currentUser, userProfile } = useAuth();
  const { items, loading } = useMyCollection(currentUser?.uid);

  const [editListingId, setEditListingId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const { items: wishlistItems, loading: wishlistLoading } = useMyWishlist(
    currentUser?.uid
  );
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [wishlistPostId, setWishlistPostId] = useState<string | null>(null);
  const [wishlistSize, setWishlistSize] = useState<number>(0);

  const wishlistedByPost = useMemo(() => {
    const map = new Map<
      string,
      {
        postId: string;
        name: string;
        brand?: string;
        imageUrl?: string;
        sizes: number[];
      }
    >();

    for (const w of wishlistItems) {
      const existing = map.get(w.postId);
      if (!existing) {
        map.set(w.postId, {
          postId: w.postId,
          name: w.name,
          brand: w.brand,
          imageUrl: w.imageUrl,
          sizes: [w.size],
        });
      } else {
        // dedupe sizes just in case
        if (!existing.sizes.some((s) => Number(s) === Number(w.size))) {
          existing.sizes.push(w.size);
        }
      }
    }

    // sort sizes + return array
    return Array.from(map.values()).map((g) => ({
      ...g,
      sizes: g.sizes.map((s) => Number(s)).sort((a, b) => a - b),
    }));
  }, [wishlistItems]);

  // const wishlistGridItems = wishlistItems.map((w) => ({
  //   id: w.postId,
  //   postId: w.postId,
  //   name: w.name,
  //   size: `US ${w.size}`,
  //   value: "—",
  //   imageUrl: w.imageUrl,
  //   status: undefined,
  // }));

  const gridItems = items.map((item) => ({
    id: item.id,
    postId: item.postId,
    name: item.name,
    size: item.size,
    value: item.value,
    imageUrl: item.imageUrl,
    status: item.status,
  }));

  const displayName =
    userProfile?.displayName ?? currentUser?.displayName ?? "Your Profile";

  const location = userProfile?.location ?? "Location not set";

  const bio = userProfile?.biography ?? "Add a bio so people know you.";

  const collectionCount = items.length;
  const pendingCount = items.filter((i) => i.status === "pending").length;

  const wishlistCount = wishlistItems.length;
  const tradesCount = 0;

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:max-w-4xl xl:max-w-5xl">
        <Button
          type="button"
          variant="ghost"
          className="-ml-2 mb-2 h-9 px-2"
          onClick={() => navigate(-1)}
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <ProfileHeader
          displayName={displayName}
          location={location}
          rating={5}
          bio={bio}
          onSettingsClick={() => setEditProfileOpen(true)}
          stats={{
            collectionCount,
            wishlistCount,
            tradesCount,
            pendingCount,
          }}
        />

        <div className="mt-5">
          <ProfileTabs value={tab} onValueChange={setTab} />
        </div>

        <div className="mt-5">
          {tab === "collection" ? (
            loading ? (
              <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
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
              <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
                Loading your wishlist…
              </div>
            ) : wishlistedByPost.length === 0 ? (
              <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
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
            <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
              Fashion Photos (placeholder)
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
              Recent Trades (placeholder)
            </div>
          )}
        </div>
      </div>

      <AddSneakerDialog open={addOpen} onClose={() => setAddOpen(false)} />

      <EditProfileDialog
        open={editProfileOpen}
        onClose={() => setEditProfileOpen(false)}
      />

      {editListingId && (
        <MyListingModal
          open={editOpen}
          listingId={editListingId}
          onClose={() => {
            setEditOpen(false);
            setEditListingId(null);
          }}
        />
      )}
      {wishlistPostId && (
        <MyWishlistModal
          open={wishlistOpen}
          postId={wishlistPostId}
          size={wishlistSize}
          onClose={() => {
            setWishlistOpen(false);
            setWishlistPostId(null);
            setWishlistSize(0);
          }}
        />
      )}
    </div>
  );
};

const WishlistGrid = ({
  groups,
  onSelectSize,
}: {
  groups: {
    postId: string;
    name: string;
    brand?: string;
    imageUrl?: string;
    sizes: number[];
  }[];
  onSelectSize: (postId: string, size: number) => void;
}) => {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
      {groups.map((g) => (
        <div
          key={g.postId}
          className="text-left rounded-2xl border bg-white overflow-hidden hover:shadow-sm transition"
        >
          <div className="relative aspect-[4/3] bg-white">
            {g.imageUrl ? (
              <img
                src={g.imageUrl}
                alt={g.name}
                className="h-full w-full object-contain p-3"
                referrerPolicy="no-referrer"
              />
            ) : null}
          </div>

          <div className="p-3">
            {g.brand ? (
              <div className="text-[11px] font-medium text-[#3366FF]">
                {g.brand}
              </div>
            ) : null}

            <div className="text-sm font-semibold line-clamp-2">{g.name}</div>

            <div className="mt-2 flex flex-wrap gap-2">
              {g.sizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => onSelectSize(g.postId, size)}
                  className="rounded-full border px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-[#3366FF] hover:text-[#3366FF] transition"
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
};

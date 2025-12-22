import { useState } from "react";
import { ProfileHeader } from "./ProfileHeader";
import { ProfileTabs, type ProfileTabKey } from "./ProfileTabs";
import { CollectionGrid } from "./CollectionGrid";
import { AddSneakerDialog } from "@/components/dialogs/AddSneakerDialog";
import { useAuth } from "@/lib/contexts/auth.context";
import { useMyCollection } from "@/lib/firebase/useMyCollection";
import { MyListingModal } from "@/components/dialogs/MyListingModal";
import { EditProfileDialog } from "@/components/dialogs/EditProfileDialog";

export const ProfilePage = () => {
  const [tab, setTab] = useState<ProfileTabKey>("collection");
  const [addOpen, setAddOpen] = useState(false);
  const { currentUser, userProfile } = useAuth();
  const { items, loading } = useMyCollection(currentUser?.uid);

  const [editListingId, setEditListingId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);

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

  const wishlistCount = userProfile?.wishlistCount ?? 0;
  const tradesCount = 0;

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:max-w-4xl xl:max-w-5xl">
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
    </div>
  );
};

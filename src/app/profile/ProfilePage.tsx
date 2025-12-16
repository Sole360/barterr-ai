import { useState } from "react";
import { ProfileHeader } from "./ProfileHeader";
import { ProfileTabs, type ProfileTabKey } from "./ProfileTabs";
import { CollectionGrid } from "./CollectionGrid";
import { AddSneakerDialog } from "@/components/dialogs/AddSneakerDialog";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useMyCollection } from "@/lib/firebase/useMyCollection";

export function ProfilePage() {
  const [tab, setTab] = useState<ProfileTabKey>("collection");
  const [addOpen, setAddOpen] = useState(false);
  const { currentUser } = useAuth();
  const { items, loading } = useMyCollection(currentUser?.uid);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:max-w-4xl xl:max-w-5xl">
        <ProfileHeader
          displayName="Terrence Whaley"
          location="Los Angeles, CA"
          rating={5}
          bio="Write here if empty, this is placeholder."
          onSettingsClick={() => console.log("settings")}
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
                items={items}
                onAddToCollection={() => setAddOpen(true)}
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
    </div>
  );
}

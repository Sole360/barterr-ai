import { useMemo, useState } from "react";
import { ProfileHeader } from "./ProfileHeader";
import { ProfileTabs, type ProfileTabKey } from "./ProfileTabs";
import { CollectionGrid, type CollectionItem } from "./CollectionGrid";
import { AddSneakerDialog } from "@/components/dialogs/AddSneakerDialog";

export function ProfilePage() {
  const [tab, setTab] = useState<ProfileTabKey>("collection");
  const [addOpen, setAddOpen] = useState(false);

  const demoItems = useMemo<CollectionItem[]>(
    () => [
      {
        id: "1",
        name: 'Dunk Low "Michigan State"',
        size: "US 9",
        value: "$320",
        imageUrl:
          "https://images.unsplash.com/photo-1528701800489-20be3c5eea5a?auto=format&fit=crop&w=800&q=80",
        status: "approved",
      },
      {
        id: "2",
        name: "BAPE x 2002R ‘Apeos Together Strong’",
        size: "US 11",
        value: "$400",
        imageUrl:
          "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=800&q=80",
        status: "approved",
      },
      {
        id: "3",
        name: "Fragment Design x Air Jordan 3",
        size: "US 7M",
        value: "$290",
        imageUrl:
          "https://images.unsplash.com/photo-1514989940723-e8e51635b782?auto=format&fit=crop&w=800&q=80",
        status: "pending",
      },
    ],
    []
  );

  return (
    <div className="min-h-screen">
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
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
            <CollectionGrid
              items={demoItems}
              onAddToCollection={() => setAddOpen(true)}
            />
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

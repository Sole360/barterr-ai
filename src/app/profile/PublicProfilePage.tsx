import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";

import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/contexts/auth.context";
import { useMyCollection } from "@/lib/firebase/useMyCollection";
import { ProfileHeader } from "./ProfileHeader";
import { PageTransition } from "@/components/shared/PageTransition";
import { Navbar } from "@/components/shared/Navbar";
import type { User } from "@/types";

export const PublicProfilePage = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [profile, setProfile] = useState<User | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const { items, loading: collectionLoading } = useMyCollection(userId);

  // Redirect to own profile page if navigating to self
  useEffect(() => {
    if (currentUser?.uid && userId === currentUser.uid) {
      navigate("/profile", { replace: true });
    }
  }, [userId, currentUser?.uid, navigate]);

  useEffect(() => {
    if (!userId) return;
    setProfileLoading(true);
    getDoc(doc(db, "users", userId))
      .then((snap) => {
        setProfile(snap.exists() ? (snap.data() as User) : null);
      })
      .finally(() => setProfileLoading(false));
  }, [userId]);

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-32 md:pt-20 px-4 text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-32 md:pt-20 px-4 text-sm text-muted-foreground">User not found.</div>
      </div>
    );
  }

  const gridItems = items.map((item) => ({
    id: item.id,
    postId: item.postId,
    name: item.name,
    size: item.size,
    value: item.value,
    imageUrl: item.imageUrl,
    status: item.status,
  }));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <PageTransition>
        <div className="pt-32 md:pt-16">
          <ProfileHeader
            displayName={profile.displayName || `${profile.firstName} ${profile.lastName}`.trim()}
            location={profile.location}
            bio={profile.biography}
            avatarUrl={profile.photoURL}
            coverPhoto={profile.coverPhoto}
            styleTags={profile.styleTags}
            onNavigateBack={() => navigate(-1)}
          />

          <div className="max-w-4xl mx-auto px-4 pb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
              Collection
            </h2>

            {collectionLoading ? (
              <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                Loading collection…
              </div>
            ) : gridItems.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                No sneakers in collection yet.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {gridItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl bg-card border border-border overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.07)]"
                  >
                    <div className="relative aspect-square bg-white overflow-hidden rounded-t-2xl">
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="absolute inset-0 w-full h-full object-contain p-4"
                          referrerPolicy="no-referrer"
                        />
                      )}
                    </div>
                    <div className="px-3.5 pt-3 pb-3.5">
                      <div className="text-sm font-semibold text-foreground line-clamp-2 leading-snug mb-1.5">
                        {item.name}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{item.size}</span>
                        <span className="font-semibold text-foreground">{item.value}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </PageTransition>
    </div>
  );
};

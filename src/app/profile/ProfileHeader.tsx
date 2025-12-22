import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type ProfileHeaderStats = {
  collectionCount: number;
  wishlistCount: number;
  tradesCount: number;
  pendingCount?: number;
};

type Props = {
  displayName: string;
  location?: string;
  rating?: number;
  bio?: string;
  avatarUrl?: string;
  onSettingsClick?: () => void;
  stats?: ProfileHeaderStats;
};

export const ProfileHeader = ({
  displayName,
  location,
  rating = 0,
  bio,
  avatarUrl,
  onSettingsClick,
  stats,
}: Props) => {
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div className="relative rounded-2xl border bg-card p-5">
      <div className="absolute right-3 top-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onSettingsClick}
          aria-label="Settings"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <div className="absolute inset-0 -z-10 rounded-full bg-gradient-to-r from-accent to-primary blur-xl opacity-30" />
          <Avatar className="h-20 w-20 border">
            <AvatarImage src={avatarUrl} alt={displayName} />
            <AvatarFallback>{initials || "U"}</AvatarFallback>
          </Avatar>
        </div>

        <div className="mt-3">
          <h1 className="text-lg font-bold text-foreground">{displayName}</h1>
          <div className="mt-1 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            {location ? <span>{location}</span> : null}
            {rating ? (
              <span className="inline-flex items-center gap-1">
                <span aria-hidden>★</span>
                <span className="font-medium text-foreground">{rating}</span>
              </span>
            ) : null}
          </div>
        </div>

        {bio ? (
          <p className="mt-3 max-w-md text-sm text-muted-foreground">{bio}</p>
        ) : null}

        {stats ? (
          <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border bg-card p-3">
            <div className="text-center">
              <div className="text-lg font-semibold text-foreground">
                {stats.collectionCount}
              </div>
              <div className="text-xs text-muted-foreground">
                Collection
                {stats.pendingCount ? ` • ${stats.pendingCount} pending` : ""}
              </div>
            </div>

            <div className="text-center">
              <div className="text-lg font-semibold text-foreground">
                {stats.wishlistCount}
              </div>
              <div className="text-xs text-muted-foreground">Wishlist</div>
            </div>

            <div className="text-center">
              <div className="text-lg font-semibold text-foreground">
                {stats.tradesCount}
              </div>
              <div className="text-xs text-muted-foreground">Trades</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

import { useRef } from "react";
import { ArrowLeft, Camera, Settings, MapPin, Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type ProfileHeaderStats = {
  collectionCount: number;
  wishlistCount: number;
  tradesCount: number;
};

type Props = {
  displayName: string;
  location?: string;
  rating?: number;
  bio?: string;
  avatarUrl?: string;
  coverPhoto?: string;
  styleTags?: string[];
  autoBrandTags?: string[];
  onSettingsClick?: () => void;
  onCoverPhotoChange?: (file: File) => Promise<void>;
  onNavigateBack?: () => void;
  stats?: ProfileHeaderStats;
};

export const ProfileHeader = ({
  displayName,
  location,
  rating,
  bio,
  avatarUrl,
  coverPhoto,
  styleTags = [],
  autoBrandTags = [],
  onSettingsClick,
  onCoverPhotoChange,
  onNavigateBack,
  stats,
}: Props) => {
  const coverInputRef = useRef<HTMLInputElement>(null);

  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  // Merge manual tags + auto brand tags, de-duped, manual first
  const allTags = [
    ...styleTags,
    ...autoBrandTags.filter((b) => !styleTags.includes(b)),
  ].slice(0, 12);

  const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onCoverPhotoChange) {
      await onCoverPhotoChange(file);
    }
    // reset so the same file can be picked again
    e.target.value = "";
  };

  return (
    <div>
      {/* ── Cover photo ─────────────────────────────────────────────── */}
      <div className="relative h-72 overflow-hidden">
        {coverPhoto ? (
          <img
            src={coverPhoto}
            alt="Cover"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#3366FF] via-[#33C9BC] to-[#33FF99]" />
        )}

        {/* Top scrim — keeps buttons legible over any photo */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/30 to-transparent" />

        {/* Bottom fade — blends cover into page background (no hard line) */}
        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-background to-transparent" />

        {/* Back */}
        {onNavigateBack && (
          <button
            onClick={onNavigateBack}
            className="absolute left-4 top-4 p-2 bg-black/30 backdrop-blur-sm rounded-full text-white hover:bg-black/50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        {/* Cover + settings actions */}
        <div className="absolute right-4 top-4 flex gap-2">
          {onCoverPhotoChange && (
            <button
              onClick={() => coverInputRef.current?.click()}
              className="p-2 bg-black/30 backdrop-blur-sm rounded-full text-white hover:bg-black/50 transition-colors"
              title="Change cover photo"
            >
              <Camera className="w-5 h-5" />
            </button>
          )}
          {onSettingsClick && (
            <button
              onClick={onSettingsClick}
              className="p-2 bg-black/30 backdrop-blur-sm rounded-full text-white hover:bg-black/50 transition-colors"
              title="Edit profile"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
        </div>

        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleCoverFileChange}
        />
      </div>

      {/* ── Avatar + info ────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4">
        {/* Avatar sits inside the fade zone — no harsh overlap line */}
        <div className="flex justify-center -mt-16 mb-4">
          <div className="relative">
            {/* Gradient ring */}
            <div className="p-[3px] rounded-full bg-gradient-to-br from-[#33FF99] to-[#3366FF]">
              <div className="p-[2px] rounded-full bg-background">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
                  <AvatarFallback className="text-xl font-bold bg-muted">
                    {initials || "U"}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
          </div>
        </div>

        {/* Name & meta */}
        <div className="text-center mb-3">
          <h1 className="text-2xl font-bold text-foreground">{displayName}</h1>
          <div className="flex items-center justify-center gap-3 mt-1.5 text-sm text-muted-foreground">
            {location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {location}
              </span>
            )}
            {rating != null && rating > 0 && (
              <span className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                <span className="font-semibold text-foreground">{rating}</span>
              </span>
            )}
          </div>
        </div>

        {/* Bio */}
        {bio && (
          <p className="text-center text-sm text-muted-foreground max-w-sm mx-auto mb-4 leading-relaxed">
            {bio}
          </p>
        )}

        {/* Style tags */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mb-5">
            {allTags.map((tag) => (
              <span
                key={tag}
                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  styleTags.includes(tag)
                    ? "bg-[#3366FF]/10 text-[#3366FF] dark:bg-[#3366FF]/20"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 divide-x divide-border rounded-2xl border border-border overflow-hidden mb-6">
            {[
              { label: "Collection", value: stats.collectionCount },
              { label: "Wishlist", value: stats.wishlistCount },
              { label: "Trades", value: stats.tradesCount },
            ].map(({ label, value }) => (
              <div key={label} className="py-4 text-center bg-card">
                <div className="text-xl font-bold text-foreground">{value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

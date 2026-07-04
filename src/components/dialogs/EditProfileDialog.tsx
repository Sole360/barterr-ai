import { useEffect, useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/contexts/auth.context";
import { db, storage, auth } from "@/lib/firebase/config";
import { doc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { updateProfile } from "firebase/auth";
import { useToast } from "@/hooks/use-toast";
import { Camera } from "lucide-react";

const STYLE_TAGS = [
  "Retro", "Deadstock", "Hype", "Collab", "Streetwear",
  "Luxury", "Vintage", "Running", "Basketball", "Skateboarding",
  "Lifestyle", "Limited Edition", "Grail", "Performance",
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export const EditProfileDialog = ({ open, onClose }: Props) => {
  const { currentUser, userProfile } = useAuth();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState("");
  const [biography, setBiography] = useState("");
  const [location, setLocation] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>("");

  useEffect(() => {
    if (!open || !userProfile) return;
    setDisplayName(userProfile.displayName ?? "");
    setBiography(userProfile.biography ?? "");
    setLocation(userProfile.location ?? "");
    setSelectedTags(userProfile.styleTags ?? []);
    setAvatarFile(null);
    setAvatarPreview("");
  }, [open, userProfile]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setAvatarFile(file);
    if (file) setAvatarPreview(URL.createObjectURL(file));
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : prev.length < 10
          ? [...prev, tag]
          : prev
    );
  };

  const handleSave = async () => {
    if (!currentUser?.uid) return;
    setSaving(true);
    try {
      let photoURL = userProfile?.photoURL ?? "";

      if (avatarFile) {
        const avatarRef = ref(storage, `users/${currentUser.uid}/avatar`);
        await uploadBytes(avatarRef, avatarFile, { contentType: avatarFile.type });
        photoURL = await getDownloadURL(avatarRef);
      }

      await updateDoc(doc(db, "users", currentUser.uid), {
        displayName: displayName.trim(),
        biography: biography.trim(),
        location: location.trim(),
        photoURL,
        styleTags: selectedTags,
      });

      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: displayName.trim(),
          photoURL,
        });
      }

      toast({ title: "Profile updated" });
      onClose();
    } catch (err) {
      console.error("EditProfileDialog save error:", err);
      toast({ title: "Error", description: "Failed to update profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const currentAvatar = avatarPreview || userProfile?.photoURL || "";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-background [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Avatar */}
          <div className="space-y-2">
            <Label>Profile Photo</Label>
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-muted overflow-hidden border border-border">
                  {currentAvatar ? (
                    <img src={currentAvatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#33FF99] to-[#3366FF]" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 p-1.5 bg-[#3366FF] rounded-full text-white shadow"
                >
                  <Camera className="w-3 h-3" />
                </button>
              </div>
              <span className="text-sm text-muted-foreground">
                {avatarFile ? avatarFile.name : "Click the camera to change"}
              </span>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          {/* Display name */}
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          {/* Bio */}
          <div className="space-y-1.5">
            <Label htmlFor="biography">Bio</Label>
            <Textarea
              id="biography"
              value={biography}
              onChange={(e) => setBiography(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="Tell people a little about yourself"
            />
            <div className="text-xs text-muted-foreground text-right">{biography.length}/300</div>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City, State"
            />
          </div>

          {/* Style tags */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Label>Style Tags</Label>
              <span className="text-xs text-muted-foreground">{selectedTags.length}/10 selected</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Let others know your style. Pick up to 10.
            </p>
            <div className="flex flex-wrap gap-2">
              {STYLE_TAGS.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                      active
                        ? "bg-[#3366FF] border-[#3366FF] text-white"
                        : "border-border bg-background text-foreground hover:border-[#3366FF]/50"
                    } ${!active && selectedTags.length >= 10 ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button className="flex-1 bg-[#3366FF] hover:bg-[#3366FF]/90" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

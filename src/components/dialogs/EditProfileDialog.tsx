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
import { db } from "@/lib/firebase/config";
import { doc, updateDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { storage, auth } from "@/lib/firebase/config";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { updateProfile } from "firebase/auth";

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
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open || !userProfile) return;

    setDisplayName(userProfile.displayName ?? "");
    setBiography(userProfile.biography ?? "");
    setLocation(userProfile.location ?? "");
  }, [open, userProfile]);

  const handleSave = async () => {
    if (!currentUser?.uid) return;

    setSaving(true);
    try {
      let photoURL = userProfile?.photoURL ?? "";

      if (avatarFile) {
        const avatarPath = `users/${currentUser.uid}/avatar`;
        const avatarRef = ref(storage, avatarPath);

        await uploadBytes(avatarRef, avatarFile, {
          contentType: avatarFile.type,
        });

        photoURL = await getDownloadURL(avatarRef);
      }

      await updateDoc(doc(db, "users", currentUser.uid), {
        displayName: displayName.trim(),
        biography: biography.trim(),
        location: location.trim(),
        photoURL,
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
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg bg-white [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Profile Photo</Label>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
              >
                Change photo
              </Button>

              {avatarFile && (
                <span className="text-sm text-muted-foreground">
                  {avatarFile.name}
                </span>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="biography">Bio</Label>
            <Textarea
              id="biography"
              value={biography}
              onChange={(e) => setBiography(e.target.value)}
              rows={4}
              maxLength={300}
              placeholder="Tell people a little about yourself"
            />
            <div className="text-xs text-muted-foreground text-right">
              {biography.length}/300
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City, State"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

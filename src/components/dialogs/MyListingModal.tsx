import { useEffect, useMemo, useRef, useState } from "react";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  Timestamp,
  arrayRemove,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { db } from "@/lib/firebase/config";
import { storage } from "@/lib/firebase/config";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/contexts/auth.context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Camera, Loader2, X } from "lucide-react";
import imageCompression from "browser-image-compression";
import type { Listing, Post } from "@/types";

type PhotoKey = keyof NonNullable<Listing["photos"]>;

const PHOTO_CATEGORIES: { key: PhotoKey; label: string }[] = [
  { key: "appearance", label: "Appearance" },
  { key: "boxFrontal", label: "Box Front" },
  { key: "boxLabel", label: "Box Label" },
  { key: "insoles", label: "Insoles" },
  { key: "insoleStitching", label: "Stitching" },
  { key: "dateCode", label: "Date Code" },
];

function storagePathFromUrl(url: string): string | null {
  try {
    const match = url.match(/\/o\/(.+?)(?:\?|$)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

type Props = {
  open: boolean;
  listingId: string | null;
  onClose: () => void;
};

export const MyListingModal = ({ open, listingId, onClose }: Props) => {
  const { toast } = useToast();
  const { currentUser } = useAuth();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listing, setListing] = useState<Listing | null>(null);
  const [post, setPost] = useState<Post | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);

  const [tradeValue, setTradeValue] = useState("");
  const [conditionGrade, setConditionGrade] = useState(10);
  const [hasBox, setHasBox] = useState(true);
  const [hasInsoles, setHasInsoles] = useState(true);
  const [hasLaces, setHasLaces] = useState(true);
  const [flaws, setFlaws] = useState("");

  // Photo editing
  const [photos, setPhotos] = useState<NonNullable<Listing["photos"]>>({});
  const [photoUploading, setPhotoUploading] = useState<Partial<Record<PhotoKey, boolean>>>({});
  // URLs to delete from storage when the user saves (replaced / removed originals and session uploads)
  const [urlsToDelete, setUrlsToDelete] = useState<string[]>([]);
  // Every URL uploaded this session — deleted on cancel to avoid orphans
  const [sessionUrls, setSessionUrls] = useState<string[]>([]);
  // Prevents cleanup of session uploads when the modal closes after a successful save
  const saveSucceeded = useRef(false);

  const anyPhotoUploading = Object.values(photoUploading).some(Boolean);

  const canSave = useMemo(() => {
    const v = Number(tradeValue);
    return Number.isFinite(v) && v >= 0 && conditionGrade >= 1 && conditionGrade <= 10;
  }, [tradeValue, conditionGrade]);

  useEffect(() => {
    const run = async () => {
      if (!open || !listingId) return;

      setLoading(true);
      setListing(null);
      setPost(null);
      saveSucceeded.current = false;
      setUrlsToDelete([]);
      setSessionUrls([]);
      setPhotoUploading({});

      try {
        const snap = await getDoc(doc(db, "listings", listingId));
        if (!snap.exists()) {
          toast({ title: "Not found", description: "That listing no longer exists.", variant: "destructive" });
          onClose();
          return;
        }

        const data = { ...(snap.data() as Listing), id: snap.id };

        if (data.userId !== currentUser?.uid) {
          toast({ title: "Not allowed", description: "You can only edit your own listings.", variant: "destructive" });
          onClose();
          return;
        }

        setListing(data);
        setTradeValue(String(data.tradeValue));
        setConditionGrade(data.conditionGrade ?? 10);
        setHasBox(data.hasBox ?? true);
        setHasInsoles(data.hasInsoles ?? true);
        setHasLaces(data.hasLaces ?? true);
        setFlaws(data.flaws ?? "");
        setPhotos(data.photos ?? {});

        const postSnap = await getDoc(doc(db, "posts", data.postId));
        if (postSnap.exists()) {
          setPost({ ...(postSnap.data() as Post), postId: data.postId });
        }
      } catch (err) {
        console.error("MyListingModal load error:", err);
        toast({ title: "Error", description: "Failed to load listing.", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [open, listingId, currentUser?.uid, onClose, toast]);

  // On cancel: delete all session-uploaded URLs that weren't committed to Firestore
  const handleClose = () => {
    if (!saveSucceeded.current) {
      sessionUrls.forEach((url) => {
        const path = storagePathFromUrl(url);
        if (path) deleteObject(ref(storage, path)).catch(() => {});
      });
    }
    onClose();
  };

  const handlePhotoReplace = async (key: PhotoKey, file: File) => {
    if (!listingId || !currentUser?.uid) return;

    const oldUrl = photos[key];
    setPhotoUploading((prev) => ({ ...prev, [key]: true }));

    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.1,
        maxWidthOrHeight: 2200,
        useWebWorker: true,
      });

      const path = `sneaker_uploads/${currentUser.uid}/${listingId}/photos/${key}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, compressed);

      await new Promise<void>((resolve, reject) => {
        task.on("state_changed", null, reject, async () => {
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            setPhotos((prev) => ({ ...prev, [key]: url }));
            setSessionUrls((prev) => [...prev, url]);
            // Queue the replaced URL for deletion on save (now that upload succeeded)
            if (oldUrl) setUrlsToDelete((prev) => [...prev, oldUrl]);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    } catch (err) {
      console.error("Photo upload error:", err);
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
      // Leave photos state unchanged — old photo is still shown
    } finally {
      setPhotoUploading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handlePhotoRemove = (key: PhotoKey) => {
    const url = photos[key];
    if (url) setUrlsToDelete((prev) => [...prev, url]);
    setPhotos((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // Saves all changes (including photos) and marks the listing as pending review
  const handleResubmit = async () => {
    if (!listingId || anyPhotoUploading) return;
    setResubmitting(true);
    try {
      await updateDoc(doc(db, "listings", listingId), {
        tradeValue: Number(tradeValue),
        conditionGrade,
        condition: conditionGrade === 10 ? "new" : "used",
        hasBox,
        hasInsoles,
        hasLaces,
        flaws,
        photos,
        approvalStatus: "pending",
        reviewFeedback: deleteField(),
        updatedAt: Timestamp.now(),
      });

      urlsToDelete.forEach((url) => {
        const path = storagePathFromUrl(url);
        if (path) deleteObject(ref(storage, path)).catch(() => {});
      });

      saveSucceeded.current = true;
      toast({ title: "Resubmitted for review" });
      onClose();
    } catch (err) {
      console.error("MyListingModal resubmit error:", err);
      toast({ title: "Error", description: "Failed to resubmit.", variant: "destructive" });
    } finally {
      setResubmitting(false);
    }
  };

  const handleSave = async () => {
    if (!listingId || !canSave || anyPhotoUploading) return;

    setSaving(true);
    try {
      await updateDoc(doc(db, "listings", listingId), {
        tradeValue: Number(tradeValue),
        conditionGrade,
        condition: conditionGrade === 10 ? "new" : "used",
        hasBox,
        hasInsoles,
        hasLaces,
        flaws,
        photos,
        updatedAt: Timestamp.now(),
      });

      urlsToDelete.forEach((url) => {
        const path = storagePathFromUrl(url);
        if (path) deleteObject(ref(storage, path)).catch(() => {});
      });

      saveSucceeded.current = true;
      toast({ title: "Saved" });
      onClose();
    } catch (err) {
      console.error("MyListingModal save error:", err);
      toast({ title: "Error", description: "Failed to save changes.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!listing || !listingId || !currentUser?.uid) return;

    setRemoveConfirmOpen(false);
    saveSucceeded.current = true; // listing deleted — no need to orphan-clean session uploads
    onClose();

    try {
      if (post?.owners?.length) {
        const ownerToRemove = post.owners.find(
          (o) =>
            o.userId === currentUser.uid &&
            o.size === listing.size &&
            o.condition === listing.conditionGrade
        );

        if (ownerToRemove) {
          await updateDoc(doc(db, "posts", listing.postId), {
            owners: arrayRemove(ownerToRemove),
            updatedAt: Timestamp.now(),
          });
        }
      }

      await deleteDoc(doc(db, "listings", listingId));

      toast({ title: "Removed from your collection" });
    } catch (err) {
      console.error("MyListingModal remove error:", err);
      toast({ title: "Error", description: "Failed to remove from collection.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-xl bg-card [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>Edit Listing</DialogTitle>
        </DialogHeader>

        {loading || !listing ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="overflow-y-auto max-h-[72vh] space-y-5 pr-1">
            {post && (
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <div className="h-16 w-16 rounded-md bg-white dark:bg-white/10 overflow-hidden border">
                  <img src={post.productImageUrl} alt={post.title} className="h-full w-full object-contain p-1" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-[#3366FF]">{post.brand}</div>
                  <div className="text-sm font-semibold truncate">{post.title}</div>
                </div>
              </div>
            )}

            {listing.approvalStatus === "changes_requested" && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 p-3">
                <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1">
                  Changes Requested
                </div>
                <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                  {listing.reviewFeedback ?? "Please update your listing and resubmit for review."}
                </p>
                <Button
                  size="sm"
                  className="mt-3 bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={handleResubmit}
                  disabled={resubmitting || anyPhotoUploading}
                >
                  {resubmitting ? "Resubmitting…" : anyPhotoUploading ? "Uploading photos…" : "Resubmit for Review"}
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <Label>Trade Value</Label>
              <Input type="number" value={tradeValue} onChange={(e) => setTradeValue(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Condition Grade ({conditionGrade}/10)</Label>
              <input
                type="range"
                min="1"
                max="10"
                value={conditionGrade}
                onChange={(e) => setConditionGrade(Number(e.target.value))}
                className="w-full accent-[#3366FF]"
              />
            </div>

            <div className="space-y-2">
              <Label>Notes / Flaws</Label>
              <Textarea value={flaws} onChange={(e) => setFlaws(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Photos</Label>
              <div className="grid grid-cols-3 gap-2">
                {PHOTO_CATEGORIES.map(({ key, label }) => {
                  const url = photos[key];
                  const isUploading = !!photoUploading[key];

                  return (
                    <div key={key} className="space-y-1">
                      <div className="text-[10px] font-medium text-muted-foreground text-center">{label}</div>
                      {url ? (
                        <div className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted/30">
                          <img src={url} alt={label} className="w-full h-full object-cover" />
                          {isUploading ? (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <Loader2 className="w-5 h-5 text-white animate-spin" />
                            </div>
                          ) : (
                            <>
                              {/* Tap photo to replace */}
                              <label className="absolute inset-0 cursor-pointer">
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) void handlePhotoReplace(key, file);
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => handlePhotoRemove(key)}
                                className="absolute top-1 right-1 p-0.5 bg-black/60 rounded-full text-white hover:bg-black/80 z-10"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        <label className="aspect-square flex flex-col items-center justify-center cursor-pointer border border-dashed border-border rounded-lg hover:border-[#3366FF]/50 hover:bg-accent transition-colors">
                          {isUploading ? (
                            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                          ) : (
                            <>
                              <Camera className="w-5 h-5 text-muted-foreground mb-1" />
                              <span className="text-[10px] text-muted-foreground">Add</span>
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void handlePhotoReplace(key, file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={!canSave || saving || anyPhotoUploading}
              >
                {anyPhotoUploading ? "Uploading…" : saving ? "Saving…" : "Save"}
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => setRemoveConfirmOpen(true)}
                disabled={saving || anyPhotoUploading}
              >
                Remove
              </Button>
              <Button variant="outline" className="flex-1" onClick={handleClose}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <AlertDialog open={removeConfirmOpen} onOpenChange={setRemoveConfirmOpen}>
          <AlertDialogContent className="bg-card">
            <AlertDialogHeader>
              <AlertDialogTitle>Remove from collection?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove this sneaker from your collection.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void handleRemove();
                }}
                disabled={saving}
                className="bg-red-600 hover:bg-red-600/90"
              >
                {saving ? "Removing…" : "Remove"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
};

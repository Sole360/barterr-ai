import { useEffect, useMemo, useState } from "react";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  Timestamp,
  arrayRemove,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
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
import type { Listing, Post } from "@/types";

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

  const canSave = useMemo(() => {
    const v = Number(tradeValue);
    return (
      Number.isFinite(v) &&
      v >= 0 &&
      conditionGrade >= 1 &&
      conditionGrade <= 10
    );
  }, [tradeValue, conditionGrade]);

  useEffect(() => {
    const run = async () => {
      if (!open || !listingId) return;

      setLoading(true);
      setListing(null);
      setPost(null);

      try {
        const snap = await getDoc(doc(db, "listings", listingId));
        if (!snap.exists()) {
          toast({
            title: "Not found",
            description: "That listing no longer exists.",
            variant: "destructive",
          });
          onClose();
          return;
        }

        const data = { ...(snap.data() as Listing), id: snap.id };

        if (data.userId !== currentUser?.uid) {
          toast({
            title: "Not allowed",
            description: "You can only edit your own listings.",
            variant: "destructive",
          });
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

        const postSnap = await getDoc(doc(db, "posts", data.postId));
        if (postSnap.exists()) {
          setPost({ ...(postSnap.data() as Post), postId: data.postId });
        }
      } catch (err) {
        console.error("MyListingModal load error:", err);
        toast({
          title: "Error",
          description: "Failed to load listing.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [open, listingId, currentUser?.uid, onClose, toast]);

  const handleResubmit = async () => {
    if (!listingId) return;
    setResubmitting(true);
    try {
      await updateDoc(doc(db, "listings", listingId), {
        approvalStatus: "pending",
        reviewFeedback: deleteField(),
        updatedAt: Timestamp.now(),
      });
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
    if (!listingId || !canSave) return;

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
        updatedAt: Timestamp.now(),
      });

      toast({ title: "Saved" });
      onClose();
    } catch (err) {
      console.error("MyListingModal save error:", err);
      toast({
        title: "Error",
        description: "Failed to save changes.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!listing || !listingId || !currentUser?.uid) return;

    setRemoveConfirmOpen(false);
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
      toast({
        title: "Error",
        description: "Failed to remove from collection.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl bg-card [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>Edit Listing</DialogTitle>
        </DialogHeader>

        {loading || !listing ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-5">
            {post && (
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <div className="h-16 w-16 rounded-md bg-white dark:bg-white/10 overflow-hidden border">
                  <img
                    src={post.productImageUrl}
                    alt={post.title}
                    className="h-full w-full object-contain p-1"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-[#3366FF]">
                    {post.brand}
                  </div>
                  <div className="text-sm font-semibold truncate">
                    {post.title}
                  </div>
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
                  disabled={resubmitting}
                >
                  {resubmitting ? "Resubmitting…" : "Resubmit for Review"}
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <Label>Trade Value</Label>
              <Input
                type="number"
                value={tradeValue}
                onChange={(e) => setTradeValue(e.target.value)}
              />
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
              <Textarea
                value={flaws}
                onChange={(e) => setFlaws(e.target.value)}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={!canSave || saving}
              >
                Save
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => setRemoveConfirmOpen(true)}
                disabled={saving}
              >
                Remove
              </Button>
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <AlertDialog
          open={removeConfirmOpen}
          onOpenChange={setRemoveConfirmOpen}
        >
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

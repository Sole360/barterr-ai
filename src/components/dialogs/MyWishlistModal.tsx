import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/contexts/auth.context";
import type { Post } from "@/types";
import { removeFromWishlist } from "@/lib/firebase/posts.service";

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

type Props = {
  open: boolean;
  postId: string | null;
  size: number;
  onClose: () => void;
};

export const MyWishlistModal = ({ open, postId, size, onClose }: Props) => {
  const { toast } = useToast();
  const { currentUser } = useAuth();

  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [post, setPost] = useState<Post | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!open || !postId) return;

      setLoading(true);
      setPost(null);

      try {
        const snap = await getDoc(doc(db, "posts", postId));
        if (!snap.exists()) {
          setPost(null);
          return;
        }

        setPost({ ...(snap.data() as Post), postId });
      } catch (err) {
        console.error("MyWishlistModal load error:", err);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [open, postId]);

  const handleRemove = async () => {
    if (!currentUser?.uid || !postId || !post?.wishers) return;

    setWorking(true);
    try {
      await removeFromWishlist(postId, currentUser.uid, size, post.wishers);

      toast({ title: "Removed from wishlist" });
      setConfirmOpen(false);
      onClose();
    } catch (err) {
      console.error("Remove wishlist error:", err);
      toast({
        title: "Error",
        description: "Failed to remove from wishlist.",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl bg-card [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>Wishlist Item</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !post ? (
          <div className="text-sm text-muted-foreground">No post loaded.</div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <div className="h-16 w-16 rounded-md bg-white dark:bg-white/10 overflow-hidden border flex-shrink-0">
                <img
                  src={post.productImageUrl}
                  alt={post.title}
                  className="h-full w-full object-contain p-1"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-[#3366FF]">
                  {post.brand}
                </div>
                <div className="text-sm font-semibold text-foreground truncate">
                  {post.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  Size: US {size}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => setConfirmOpen(true)}
                disabled={working}
              >
                Remove
              </Button>
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent className="bg-card">
            <AlertDialogHeader>
              <AlertDialogTitle>Remove from wishlist?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove this sneaker from your wishlist.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void handleRemove();
                }}
                disabled={working}
                className="bg-red-600 hover:bg-red-600/90"
              >
                {working ? "Removing…" : "Remove"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
};

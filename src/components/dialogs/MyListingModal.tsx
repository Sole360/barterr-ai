import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/contexts/auth.context";
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
import type { Listing } from "@/types";
import type { Post } from "@/types";

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

      setListing(null);
      setPost(null);
      setLoading(true);
      setTradeValue("");
      setConditionGrade(10);
      setHasBox(true);
      setHasInsoles(true);
      setHasLaces(true);
      setFlaws("");

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

        const data = { ...(snap.data() as Listing), id: snap.id } as Listing;

        // Owner guard (basic)
        if (
          currentUser?.uid &&
          data.userId &&
          data.userId !== currentUser.uid
        ) {
          toast({
            title: "Not allowed",
            description: "You can only edit your own listings.",
            variant: "destructive",
          });
          onClose();
          return;
        }

        setListing(data);
        try {
          const postSnap = await getDoc(doc(db, "posts", data.postId));
          if (postSnap.exists()) {
            setPost({ ...(postSnap.data() as Post), postId: data.postId });
          } else {
            setPost(null);
          }
        } catch (err) {
          console.warn("MyListingModal: failed to load post", {
            postId: data.postId,
            err,
          });
          setPost(null);
        }

        // hydrate form
        setTradeValue(String(data.tradeValue));
        setConditionGrade(data.conditionGrade ?? 10);
        setHasBox(data.hasBox ?? true);
        setHasInsoles(data.hasInsoles ?? true);
        setHasLaces(data.hasLaces ?? true);
        setFlaws(data.flaws ?? "");
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

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-xl bg-white [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>Edit Listing</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !listing ? (
          <div className="text-sm text-muted-foreground">
            No listing loaded.
          </div>
        ) : (
          <div className="space-y-5">
            {post ? (
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <div className="h-16 w-16 rounded-md bg-white overflow-hidden border flex-shrink-0">
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
                  <div className="text-sm font-semibold text-gray-900 truncate">
                    {post.title}
                  </div>
                  {/* <div className="text-xs text-muted-foreground">
                    Post: {post.postId}
                  </div> */}
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border p-3 text-sm">
              <div className="font-medium">Status</div>
              <div className="text-muted-foreground">
                {listing.approvalStatus ?? "approved"}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tradeValue">Trade Value</Label>
              <Input
                id="tradeValue"
                type="number"
                min="0"
                step="1"
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
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#3366FF]"
              />
            </div>

            <div className="space-y-2">
              <Label>Included</Label>
              <div className="space-y-3 pl-1">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasBox}
                    onChange={(e) => setHasBox(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 cursor-pointer"
                  />
                  <span className="ml-3 text-sm">Original Box</span>
                </label>

                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasInsoles}
                    onChange={(e) => setHasInsoles(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 cursor-pointer"
                  />
                  <span className="ml-3 text-sm">Insoles</span>
                </label>

                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasLaces}
                    onChange={(e) => setHasLaces(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 cursor-pointer"
                  />
                  <span className="ml-3 text-sm">Original Laces</span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="flaws">Notes / Flaws</Label>
              <Textarea
                id="flaws"
                value={flaws}
                onChange={(e) => setFlaws(e.target.value)}
                rows={4}
                placeholder="Anything buyers should know…"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={!canSave || saving}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

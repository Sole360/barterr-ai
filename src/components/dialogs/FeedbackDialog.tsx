import { useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/contexts/auth.context";
import { db, storage } from "@/lib/firebase/config";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useToast } from "@/hooks/use-toast";
import { Bug, ImagePlus, Lightbulb, MessageCircle, X } from "lucide-react";

const MAX_SCREENSHOTS = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

type FeedbackType = "bug" | "feature" | "other";

const TYPE_OPTIONS: { value: FeedbackType; label: string; icon: typeof Bug }[] = [
  { value: "bug", label: "Bug", icon: Bug },
  { value: "feature", label: "Feature idea", icon: Lightbulb },
  { value: "other", label: "Other", icon: MessageCircle },
];

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const FeedbackDialog = ({ open, onOpenChange }: FeedbackDialogProps) => {
  const location = useLocation();
  const { currentUser, userProfile } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<FeedbackType>("bug");
  const [aboutThisPage, setAboutThisPage] = useState(true);
  const [otherPage, setOtherPage] = useState("");
  const [message, setMessage] = useState("");
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setType("bug");
    setAboutThisPage(true);
    setOtherPage("");
    setMessage("");
    setScreenshots([]);
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const next = [...screenshots];
    for (const file of Array.from(files)) {
      if (next.length >= MAX_SCREENSHOTS) break;
      if (!file.type.startsWith("image/")) continue;
      if (file.size > MAX_FILE_BYTES) {
        toast({
          title: "Image too large",
          description: `${file.name} is over 5MB.`,
          variant: "destructive",
        });
        continue;
      }
      next.push(file);
    }
    setScreenshots(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!currentUser || !message.trim()) return;
    setSubmitting(true);
    try {
      const urls: string[] = [];
      for (const [i, file] of screenshots.entries()) {
        const path = `users/${currentUser.uid}/feedback/${Date.now()}_${i}_${file.name}`;
        const fileRef = ref(storage, path);
        await uploadBytes(fileRef, file, { contentType: file.type });
        urls.push(await getDownloadURL(fileRef));
      }

      await addDoc(collection(db, "feedback"), {
        userId: currentUser.uid,
        userName: userProfile?.displayName ?? currentUser.displayName ?? "",
        email: currentUser.email ?? "",
        type,
        page: aboutThisPage ? location.pathname : otherPage.trim() || null,
        pageIsCurrent: aboutThisPage,
        message: message.trim(),
        screenshots: urls,
        status: "new",
        userAgent: navigator.userAgent,
        createdAt: Timestamp.now(),
      });

      toast({
        title: "Feedback sent",
        description: "Thanks — we read every one.",
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      console.error("Feedback submit failed:", err);
      toast({
        title: "Couldn't send feedback",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Give feedback</DialogTitle>
          <DialogDescription>
            Spotted a bug or have an idea? Tell us — screenshots help a lot.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type */}
          <div className="flex gap-2">
            {TYPE_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                  type === value
                    ? "border-[#3366FF] bg-[#3366FF]/10 text-[#3366FF]"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Page */}
          <div className="space-y-2">
            <Label>Which page is this about?</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAboutThisPage(true)}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm transition-colors ${
                  aboutThisPage
                    ? "border-[#3366FF] bg-[#3366FF]/10 text-[#3366FF] font-medium"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                This page
                <span className="block text-xs opacity-70 truncate">{location.pathname}</span>
              </button>
              <button
                type="button"
                onClick={() => setAboutThisPage(false)}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm transition-colors ${
                  !aboutThisPage
                    ? "border-[#3366FF] bg-[#3366FF]/10 text-[#3366FF] font-medium"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                Somewhere else
                <span className="block text-xs opacity-70">or the app overall</span>
              </button>
            </div>
            {!aboutThisPage && (
              <Input
                placeholder="Which page or feature? (optional)"
                value={otherPage}
                onChange={(e) => setOtherPage(e.target.value)}
              />
            )}
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="feedbackMessage">What happened, or what would you like?</Label>
            <Textarea
              id="feedbackMessage"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                type === "bug"
                  ? "What did you expect, and what happened instead?"
                  : "Tell us your idea…"
              }
            />
          </div>

          {/* Screenshots */}
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="flex items-center gap-2 flex-wrap">
              {screenshots.map((file, i) => (
                <div key={i} className="relative">
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="w-16 h-16 object-cover rounded-lg border border-border"
                  />
                  <button
                    type="button"
                    onClick={() => setScreenshots(screenshots.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {screenshots.length < MAX_SCREENSHOTS && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-16 h-16 rounded-lg border border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:bg-accent transition-colors"
                >
                  <ImagePlus className="w-5 h-5" />
                  <span className="text-[10px] mt-0.5">Add</span>
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Up to {MAX_SCREENSHOTS} screenshots, 5MB each
            </p>
          </div>

          <Button
            className="w-full bg-[#3366FF] hover:bg-[#3366FF]/90"
            disabled={!message.trim() || submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Sending…" : "Send feedback"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

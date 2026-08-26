import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { Megaphone, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/contexts/auth.context";
import { useToast } from "@/hooks/use-toast";

export type AnnouncementDoc = {
  id: string;
  message: string;
  color: string;
  active: boolean;
  createdAt: { toDate: () => Date } | null;
  createdBy: string;
};

const COLOR_PRESETS = [
  { label: "Amber", value: "#f59e0b", text: "#fff" },
  { label: "Blue", value: "#3366FF", text: "#fff" },
  { label: "Green", value: "#10b981", text: "#fff" },
  { label: "Red", value: "#ef4444", text: "#fff" },
  { label: "Purple", value: "#8b5cf6", text: "#fff" },
  { label: "Dark", value: "#111827", text: "#fff" },
];

export const AnnouncementsPage = () => {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const [announcements, setAnnouncements] = useState<AnnouncementDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState("");
  const [color, setColor] = useState(COLOR_PRESETS[0].value);
  const [customColor, setCustomColor] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AnnouncementDoc)));
      setLoading(false);
    });
    return unsub;
  }, []);

  const activeColor = customColor || color;

  const save = async () => {
    if (!message.trim() || !currentUser?.uid) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "announcements"), {
        message: message.trim(),
        color: activeColor,
        active: true,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid,
      });
      toast({ title: "Announcement created" });
      setMessage("");
      setColor(COLOR_PRESETS[0].value);
      setCustomColor("");
      setComposing(false);
    } catch {
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await updateDoc(doc(db, "announcements", id), { active: !current });
  };

  const remove = async (id: string) => {
    await deleteDoc(doc(db, "announcements", id));
    toast({ title: "Announcement deleted" });
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-foreground">Announcements</h1>
        <button
          type="button"
          onClick={() => setComposing((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3366FF] text-white text-sm font-semibold hover:bg-[#3366FF]/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New
        </button>
      </div>

      {/* Compose form */}
      {composing && (
        <div className="rounded-2xl border border-border bg-card p-4 mb-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
          <div className="text-sm font-semibold text-foreground mb-3">New Broadcast</div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your announcement…"
            rows={3}
            className="w-full text-sm rounded-xl border border-border bg-background px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#3366FF]/40 placeholder:text-muted-foreground mb-3"
          />

          {/* Color presets */}
          <div className="mb-3">
            <div className="text-xs text-muted-foreground mb-2 font-medium">Ribbon color</div>
            <div className="flex flex-wrap gap-2 items-center">
              {COLOR_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => { setColor(p.value); setCustomColor(""); }}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${
                    activeColor === p.value ? "scale-125 border-foreground" : "border-transparent"
                  }`}
                  style={{ backgroundColor: p.value }}
                  title={p.label}
                />
              ))}
              {/* Custom color */}
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={customColor || color}
                  onChange={(e) => setCustomColor(e.target.value)}
                  className="w-7 h-7 rounded-full border border-border cursor-pointer bg-transparent"
                  title="Custom color"
                />
                <span className="text-xs text-muted-foreground">Custom</span>
              </div>
            </div>
          </div>

          {/* Preview */}
          {message.trim() && (
            <div
              className="rounded-xl px-4 py-2.5 mb-3 text-sm font-medium text-center"
              style={{ backgroundColor: activeColor, color: "#fff" }}
            >
              {message}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!message.trim() || saving}
              className="flex-1 py-2.5 rounded-xl bg-[#3366FF] text-white text-sm font-semibold hover:bg-[#3366FF]/90 transition-colors disabled:opacity-40"
            >
              {saving ? "Saving…" : "Publish"}
            </button>
            <button
              type="button"
              onClick={() => setComposing(false)}
              className="px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : announcements.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <Megaphone className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <div className="text-sm text-muted-foreground">No announcements yet</div>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div key={a.id} className={`rounded-2xl border border-border bg-card p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] ${!a.active ? "opacity-50" : ""}`}>
              {/* Ribbon preview */}
              <div
                className="rounded-xl px-3 py-2 text-sm font-medium mb-3"
                style={{ backgroundColor: a.color, color: "#fff" }}
              >
                {a.message}
              </div>
              <div className="flex items-center justify-between">
                <div className="text-[10px] text-muted-foreground">
                  {a.active ? "Live" : "Inactive"} · {a.createdAt?.toDate().toLocaleDateString()}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleActive(a.id, a.active)}
                    className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                    title={a.active ? "Deactivate" : "Activate"}
                  >
                    {a.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(a.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-muted-foreground hover:text-red-500"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

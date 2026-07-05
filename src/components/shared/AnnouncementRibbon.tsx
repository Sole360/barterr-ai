import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { X } from "lucide-react";
import { db } from "@/lib/firebase/config";
import type { AnnouncementDoc } from "@/app/admin/AnnouncementsPage";

export const AnnouncementRibbon = () => {
  const [announcement, setAnnouncement] = useState<AnnouncementDoc | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, "announcements"),
      where("active", "==", true),
      limit(1)
    );
    const unsub = onSnapshot(q, (snap) => {
      const doc = snap.docs[0];
      setAnnouncement(doc ? ({ id: doc.id, ...doc.data() } as AnnouncementDoc) : null);
    });
    return unsub;
  }, []);

  if (!announcement || dismissed === announcement.id) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between px-4 py-2.5 text-sm font-medium"
      style={{ backgroundColor: announcement.color, color: "#fff" }}
    >
      <span className="flex-1 text-center text-[13px] leading-snug pr-6">
        {announcement.message}
      </span>
      <button
        type="button"
        onClick={() => setDismissed(announcement.id)}
        className="shrink-0 opacity-80 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

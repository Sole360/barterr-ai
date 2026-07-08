import { useEffect, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./config";

export type NotificationType =
  | "new_trade"
  | "trade_accepted"
  | "trade_declined"
  | "trade_completed"
  | "account_warning"
  | "account_banned";

export type NotificationDoc = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, string>;
  read: boolean;
  createdAt: { toDate: () => Date } | null;
};

export function useNotifications(uid: string | undefined) {
  const [notifications, setNotifications] = useState<NotificationDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "users", uid, "notifications"),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const unsub = onSnapshot(q, (snap) => {
      setNotifications(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as NotificationDoc))
      );
      setLoading(false);
    });

    return unsub;
  }, [uid]);

  const markRead = async (notificationId: string) => {
    if (!uid) return;
    await updateDoc(
      doc(db, "users", uid, "notifications", notificationId),
      { read: true }
    );
  };

  const markAllRead = async () => {
    if (!uid) return;
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    const batch = writeBatch(db);
    for (const n of unread) {
      batch.update(doc(db, "users", uid, "notifications", n.id), { read: true });
    }
    await batch.commit();
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, loading, unreadCount, markRead, markAllRead };
}

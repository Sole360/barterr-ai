import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import type { Timestamp } from "firebase/firestore";

export type MessageDoc = {
  id: string;
  senderId: string;
  text: string;
  createdAt: Timestamp | null;
  flagged?: boolean;
};

export function useMessages(conversationId?: string, currentUid?: string) {
  const [messages, setMessages] = useState<MessageDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "conversations", conversationId, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setMessages(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as MessageDoc))
        );
        setLoading(false);

        // Mark conversation as read for current user
        if (currentUid) {
          updateDoc(doc(db, "conversations", conversationId), {
            [`unreadCount.${currentUid}`]: 0,
          }).catch(() => {});
        }
      },
      () => {
        setMessages([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [conversationId, currentUid]);

  return { messages, loading };
}

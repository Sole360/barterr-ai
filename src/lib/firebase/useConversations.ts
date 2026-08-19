import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import type { Timestamp } from "firebase/firestore";

export type ConversationDoc = {
  id: string;
  participants: string[];
  participantInfo: Record<string, { displayName: string; photoURL?: string }>;
  lastMessage: string;
  lastMessageAt: Timestamp | null;
  lastMessageBy: string;
  unreadCount: Record<string, number>;
  createdAt: Timestamp | null;
};

export function useConversations(uid?: string) {
  const [conversations, setConversations] = useState<ConversationDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "conversations"),
      where("participants", "array-contains", uid),
      orderBy("lastMessageAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setConversations(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConversationDoc))
        );
        setLoading(false);
      },
      () => {
        setConversations([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [uid]);

  return { conversations, loading };
}

import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";

type UserInfo = { displayName: string; photoURL?: string };

type SendMessageParams = {
  conversationId: string;
  senderId: string;
  senderInfo: UserInfo;
  receiverId: string;
  receiverInfo: UserInfo;
  text: string;
};

export async function sendMessage({
  conversationId,
  senderId,
  senderInfo,
  receiverId,
  receiverInfo,
  text,
}: SendMessageParams): Promise<void> {
  const convRef = doc(db, "conversations", conversationId);
  const snap = await getDoc(convRef);

  if (!snap.exists()) {
    await setDoc(convRef, {
      participants: [senderId, receiverId],
      participantInfo: {
        [senderId]: senderInfo,
        [receiverId]: receiverInfo,
      },
      lastMessage: text,
      lastMessageAt: serverTimestamp(),
      lastMessageBy: senderId,
      unreadCount: { [senderId]: 0, [receiverId]: 1 },
      createdAt: serverTimestamp(),
    });
  } else {
    await setDoc(
      convRef,
      {
        lastMessage: text,
        lastMessageAt: serverTimestamp(),
        lastMessageBy: senderId,
        [`unreadCount.${receiverId}`]: increment(1),
        participantInfo: {
          [senderId]: senderInfo,
          [receiverId]: receiverInfo,
        },
      },
      { merge: true }
    );
  }

  await addDoc(collection(db, "conversations", conversationId, "messages"), {
    senderId,
    text,
    createdAt: serverTimestamp(),
  });
}

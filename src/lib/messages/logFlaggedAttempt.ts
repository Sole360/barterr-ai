import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

type LogParams = {
  senderId: string;
  conversationId: string;
  participants: string[];
  attemptedText: string;
};

export async function logFlaggedAttempt({
  senderId,
  conversationId,
  participants,
  attemptedText,
}: LogParams): Promise<void> {
  try {
    await addDoc(collection(db, "flaggedAttempts"), {
      senderId,
      conversationId,
      participants,
      attemptedText,
      detectedAt: serverTimestamp(),
    });
  } catch {
    // Silently fail — don't surface logging errors to the user
  }
}

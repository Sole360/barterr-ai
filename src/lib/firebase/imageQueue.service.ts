import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "./config";
import type { ImageJob } from "@/types";

export async function queueImageUpload(
  postId: string,
  styleId: string,
  imageUrl: string,
  source: "stockx" | "goat"
): Promise<string> {
  const job: ImageJob = {
    postId,
    styleId,
    imageUrl,
    source,
    status: "pending",
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(db, "image_jobs"), job);
  return docRef.id;
}

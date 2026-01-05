import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import type { Listing, Post, Trade, User } from "@/types";

type CreateTradeRequestArgs = {
  post: Post;
  listing: Listing;
  senderId: string;
  senderProfile: User;
};

/**
 * Minimal trade initiation:
 * Creates a Trade doc in Firestore with legacy-shaped required fields populated.
 */
export async function createTradeRequest({
  post,
  listing,
  senderId,
  senderProfile,
}: CreateTradeRequestArgs): Promise<Trade> {
  const posterId = listing.userId;

  // Fetch poster profile (name/email/mobile)
  const posterSnap = await getDoc(doc(db, "users", posterId));
  if (!posterSnap.exists()) throw new Error("Poster profile not found");
  const posterProfile = posterSnap.data() as User;

  // Create doc id up-front so tradeId is also stored inside the doc
  const tradeRef = doc(db, "trades", crypto.randomUUID());
  const tradeId = tradeRef.id;

  const senderName =
    senderProfile.displayName ||
    `${senderProfile.firstName ?? ""} ${senderProfile.lastName ?? ""}`.trim();

  const posterName =
    posterProfile.displayName ||
    `${posterProfile.firstName ?? ""} ${posterProfile.lastName ?? ""}`.trim();

  const trade: Trade = {
    tradeId,

    senderId,
    senderMobile: senderProfile.mobile ?? "",
    senderName,
    senderEmail: senderProfile.email,
    senderNewMsg: 0,

    posterId,
    posterMobile: posterProfile.mobile ?? "",
    posterName,
    posterEmail: posterProfile.email,
    posterNewMsg: 0,

    senderRead: true,
    posterRead: false,
    senderConfirm: false,
    posterConfirm: false,
    senderPaid: false,
    posterPaid: false,
    declined: false,
    reminderSent: false,

    sentAt: serverTimestamp() as unknown as Timestamp,
  };

  await setDoc(tradeRef, {
    ...trade,

    // minimal context (helps trades screen later)
    postId: post.postId,
    listingId: listing.id,
    listingSize: listing.size,
    listingCondition: listing.condition,
    users: [senderId, posterId],
  });

  return trade;
}

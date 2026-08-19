import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import type { Listing, Post, Sneaker, Trade, TradeOffer, User } from "@/types";

function nameFromProfile(p?: Partial<User> | null) {
  const display = p?.displayName?.trim();
  if (display) return display;

  const full = `${p?.firstName ?? ""} ${p?.lastName ?? ""}`.trim();
  return full || "User";
}

function listingToSneaker(post: Post, listing: Listing): Sneaker {
  return {
    productImageUrl: listing.productImageUrl ?? post.productImageUrl,
    name: listing.productName ?? post.title,
    styleId: post.styleId,
    apiID: post.apiID,
    size: listing.size,
    condition: listing.conditionGrade, // legacy uses number grades
    ogAll: listing.hasBox ?? false,
    details: {
      box: listing.hasBox ?? false,
      insoles: listing.hasInsoles ?? false,
      laces: listing.hasLaces ?? false,
      flaws: listing.flaws ?? "",
    },
    photos: !!listing.photos,
  };
}

type CreateTradeRequestArgs = {
  post: Post;
  listing: Listing;
  senderId: string;
  senderProfile: User;
};

export async function createTradeRequest({
  post,
  listing,
  senderId,
  senderProfile,
}: CreateTradeRequestArgs): Promise<string> {
  const posterId = listing.userId;

  // fetch poster profile (name/email/mobile) like legacy
  const posterSnap = await getDoc(doc(db, "users", posterId));
  if (!posterSnap.exists()) throw new Error("Poster profile not found");
  const posterProfile = posterSnap.data() as User;

  // Build offers: requesting THIS listing => theirOffer contains poster sneaker
  const theirSneaker = listingToSneaker(post, listing);

  const theirOffer: TradeOffer = { cash: 0, sneakers: [theirSneaker] };
  const yourOffer: TradeOffer = { cash: 0, sneakers: [] };

  const tradeRequestsRef = collection(db, "tradeRequests");
  const tradeDocRef = doc(tradeRequestsRef); // auto-id
  const tradeId = tradeDocRef.id;

  const trade: Trade = {
    tradeId,

    // participants
    senderId,
    senderMobile: senderProfile.mobile ?? "",
    senderName: nameFromProfile(senderProfile),
    senderEmail: senderProfile.email,
    senderNewMsg: 0,

    posterId,
    posterMobile: posterProfile.mobile ?? "",
    posterName: nameFromProfile(posterProfile),
    posterEmail: posterProfile.email,
    posterNewMsg: 0,

    // status flags (legacy defaults)
    senderRead: true,
    posterRead: false,
    senderConfirm: true,
    posterConfirm: false,
    senderPaid: false,
    posterPaid: false,
    declined: false,
    reminderSent: false,

    // offer payload (legacy)
    theirOffer,
    yourOffer,
    offer: [
      {
        theirOffer,
        yourOffer,
        initiatedBy: senderId,
      },
    ],

    tradeLikelihood: 0,
    sentAt: serverTimestamp() as unknown as Timestamp,
  };

  // Store a little context to make Trades UI easy later (doesn't break backend)
  await setDoc(tradeDocRef, {
    ...trade,
    postId: post.postId,
    listingId: listing.id,
    users: [senderId, posterId],
  });

  return tradeId;
}

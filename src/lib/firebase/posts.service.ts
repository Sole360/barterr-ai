import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  Unsubscribe,
  updateDoc,
  deleteDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "./config";
import { Post, Listing, WisherOwner } from "@/types";
import { arrayUnion, arrayRemove } from "firebase/firestore";

// Add user to wishlist
export const addToWishlist = async (
  postId: string,
  userId: string,
  displayName: string,
  email: string,
  photoURL: string,
  size: number
): Promise<void> => {
  const postRef = doc(db, "posts", postId);

  const wisherData = {
    userId,
    displayName,
    email,
    userPhoto: photoURL || "",
    size: Number(size),
    condition: 10,
  };

  await updateDoc(postRef, {
    wishers: arrayUnion(wisherData),
    updatedAt: Timestamp.now(),
  });

  const wishlistDocId = makeWishlistDocId(postId, Number(size));
  const wishlistRef = doc(db, "users", userId, "wishlist", wishlistDocId);

  const existing = await getDoc(wishlistRef);
  if (existing.exists()) {
    // Already wishlisted for this exact size — do nothing (idempotent)
    return;
  }

  await setDoc(wishlistRef, {
    postId,
    size: Number(size),
    addedAt: Timestamp.now(),
  });
};

// Remove from wishlist
export const removeFromWishlist = async (
  postId: string,
  userId: string,
  size: number,
  currentWishers: WisherOwner[]
): Promise<void> => {
  const postRef = doc(db, "posts", postId);

  const wisherToRemove = currentWishers.find(
    (w) => w.userId === userId && Number(w.size) === Number(size)
  );

  if (wisherToRemove) {
    await updateDoc(postRef, {
      wishers: arrayRemove(wisherToRemove),
      updatedAt: Timestamp.now(),
    });
  }

  const wishlistDocId = makeWishlistDocId(postId, Number(size));
  await deleteDoc(doc(db, "users", userId, "wishlist", wishlistDocId));
};

// Add to collection (creates listing + adds to owners)
export const addToCollection = async (
  postId: string,
  userId: string,
  displayName: string,
  email: string,
  photoURL: string,
  size: number,
  conditionGrade: number,
  tradeValue: number,
  location: string,
  photos?: {
    appearance?: string;
    boxLabel?: string;
    insoles?: string;
    boxFrontal?: string;
    insoleStitching?: string;
    dateCode?: string;
  }
): Promise<void> => {
  const condition = conditionGrade === 10 ? "new" : "used";

  // Create listing using the shared function
  await createListing({
    postId,
    userId,
    userName: displayName,
    userRating: 5.0,
    size,
    condition,
    conditionGrade,
    tradeValue,
    location,
    responseTime: "Usually responds within 24 hours",
    photos,
    approvalStatus: condition === "used" && photos ? "pending" : "approved",
  });

  // Add to owners array
  const postRef = doc(db, "posts", postId);
  await updateDoc(postRef, {
    owners: arrayUnion({
      userId,
      displayName,
      email,
      userPhoto: photoURL,
      size,
      condition: conditionGrade,
    }),
    updatedAt: Timestamp.now(),
  });
};

// Subscribe to all active posts (real-time)
export const subscribeToPosts = (
  callback: (posts: Post[]) => void,
  onError?: (error: Error) => void,
  pageSize = 20
): Unsubscribe => {
  const postsRef = collection(db, "posts");
  const q = query(
    postsRef,
    where("active", "==", true),
    orderBy("postedAt", "desc"),
    limit(pageSize)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const posts = snapshot.docs.map((doc) => ({
        ...doc.data(),
        postId: doc.id,
      })) as Post[];
      callback(posts);
    },
    onError
  );
};

// Subscribe to posts by brand (real-time)
export const subscribeToPostsByBrand = (
  brand: string,
  callback: (posts: Post[]) => void,
  onError?: (error: Error) => void,
  pageSize = 20
): Unsubscribe => {
  const postsRef = collection(db, "posts");
  const q = query(
    postsRef,
    where("active", "==", true),
    where("brand", "==", brand),
    orderBy("postedAt", "desc"),
    limit(pageSize)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const posts = snapshot.docs.map((doc) => ({
        ...doc.data(),
        postId: doc.id,
      })) as Post[];
      callback(posts);
    },
    onError
  );
};

// Subscribe to a single post (real-time)
export const subscribeToPost = (
  postId: string,
  callback: (post: Post | null) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  const postRef = doc(db, "posts", postId);

  return onSnapshot(
    postRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }

      callback({
        ...snapshot.data(),
        postId: snapshot.id,
      } as Post);
    },
    onError
  );
};

// Subscribe to listings for a post (real-time)
export const subscribeToListings = (
  postId: string,
  callback: (listings: Listing[]) => void,
  filters?: {
    size?: number;
    condition?: "new" | "used";
  },
  onError?: (error: Error) => void
): Unsubscribe => {
  const listingsRef = collection(db, "listings");

  const constraints = [
    where("postId", "==", postId),
    where("approvalStatus", "==", "approved"), // Only show approved listings
    orderBy("tradeValue", "asc"),
  ];

  if (filters?.size) {
    constraints.push(where("size", "==", filters.size));
  }

  if (filters?.condition) {
    constraints.push(where("condition", "==", filters.condition));
  }

  const q = query(listingsRef, ...constraints);

  return onSnapshot(
    q,
    (snapshot) => {
      const listings = snapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
      })) as Listing[];
      callback(listings);
    },
    onError
  );
};

// One-time read operations (for when you don't need real-time)

// Get a single post by styleId (one-time read)
export const getPostByStyleId = async (styleId: string): Promise<Post | null> => {
  const postsRef = collection(db, "posts");
  const q = query(postsRef, where("styleId", "==", styleId));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return { ...snapshot.docs[0].data(), postId: snapshot.docs[0].id } as Post;
};

// Get a single post by ID (one-time read)
export const getPostById = async (postId: string): Promise<Post | null> => {
  const postRef = doc(db, "posts", postId);
  const snapshot = await getDoc(postRef);

  if (!snapshot.exists()) return null;

  return {
    ...snapshot.data(),
    postId: snapshot.id,
  } as Post;
};

// Create or update a post
export const createOrUpdatePost = async (postData: {
  styleId: string;
  title: string;
  brand: string;
  productImageUrl: string;
  userId: string;
  apiID?: string;
  source?: "stockx" | "goat";
}): Promise<string> => {
  const postsRef = collection(db, "posts");

  // Check if post already exists for this styleId
  const q = query(postsRef, where("styleId", "==", postData.styleId));
  const snapshot = await getDocs(q);

  if (!snapshot.empty) {
    // Post exists, return its ID
    return snapshot.docs[0].id;
  }

  // Create new post
  const newPost: Partial<Post> = {
    styleId: postData.styleId,
    title: postData.title,
    brand: postData.brand,
    productImageUrl: postData.productImageUrl,
    userId: postData.userId,
    ...(postData.apiID ? { apiID: postData.apiID } : {}),
    ...(postData.source ? { source: postData.source } : {}),
    wishers: [],
    owners: [],
    postedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    active: true,
    public: true,
  };

  const docRef = await addDoc(postsRef, newPost);
  return docRef.id;
};

// src/lib/firebase/posts.service.ts - FIX createListing

export const createListing = async (listingData: {
  listingId?: string;
  postId: string;
  userId: string;
  userName: string;
  userRating: number;
  size: number;
  condition: "new" | "used";
  conditionGrade: number;
  tradeValue: number;
  location: string;
  responseTime: string;
  productName?: string;
  productImageUrl?: string;
  brand?: string;
  styleId?: string;
  apiID?: string;
  source?: "stockx" | "goat";
  photos?: {
    appearance?: string;
    boxLabel?: string;
    insoles?: string;
    boxFrontal?: string;
    insoleStitching?: string;
    dateCode?: string;
  };
  approvalStatus?: "pending" | "approved" | "rejected";
}): Promise<string> => {
  const listingsRef = collection(db, "listings");

  const newListing: Partial<Listing> = {
    postId: listingData.postId,
    userId: listingData.userId,
    userName: listingData.userName,
    userRating: listingData.userRating,
    size: listingData.size,
    condition: listingData.condition,
    conditionGrade: listingData.conditionGrade,
    tradeValue: listingData.tradeValue,
    location: listingData.location,
    responseTime: listingData.responseTime,
    approvalStatus: listingData.approvalStatus ?? "approved",
    createdAt: Timestamp.now(),
    ...(listingData.productName
      ? { productName: listingData.productName }
      : {}),
    ...(listingData.productImageUrl
      ? { productImageUrl: listingData.productImageUrl }
      : {}),
    ...(listingData.brand ? { brand: listingData.brand } : {}),
    ...(listingData.styleId ? { styleId: listingData.styleId } : {}),
    ...(listingData.apiID ? { apiID: listingData.apiID } : {}),
    ...(listingData.source ? { source: listingData.source } : {}),
    ...(listingData.photos ? { photos: listingData.photos } : {}),
  };

  if (listingData.listingId) {
    await setDoc(doc(db, "listings", listingData.listingId), newListing, {
      merge: true,
    });
    return listingData.listingId;
  }

  const docRef = await addDoc(listingsRef, newListing);
  return docRef.id;
};

// Update an existing post's image URL
export const updatePostImage = async (
  postId: string,
  firebaseImageUrl: string
): Promise<void> => {
  const postRef = doc(db, "posts", postId);
  await updateDoc(postRef, {
    productImageUrl: firebaseImageUrl,
    updatedAt: Timestamp.now(),
  });
};

const makeWishlistDocId = (postId: string, size: number) => {
  const sizeKey = Number(size).toString(); // normalizes 10.0 -> "10", 10.50 -> "10.5"
  return `${postId}_${sizeKey}`;
};

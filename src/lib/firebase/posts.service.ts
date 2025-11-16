import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  Unsubscribe,
  updateDoc,
} from "firebase/firestore";
import { db } from "./config";
import { Post, Listing, WisherOwner } from "@/types";
import { arrayUnion, arrayRemove } from "firebase/firestore";

// Add user to wishlist
export async function addToWishlist(
  postId: string,
  userId: string,
  displayName: string,
  email: string,
  photoURL: string,
  size: number
): Promise<void> {
  const postRef = doc(db, "posts", postId);

  const wisherData = {
    userId,
    displayName,
    email,
    userPhoto: photoURL || "",
    size,
    condition: 10,
  };

  await updateDoc(postRef, {
    wishers: arrayUnion(wisherData),
    updatedAt: Timestamp.now(),
  });
}

// Remove from wishlist
export async function removeFromWishlist(
  postId: string,
  userId: string,
  currentWishers: WisherOwner[]
): Promise<void> {
  const postRef = doc(db, "posts", postId);

  // Find exact wisher object to remove
  const wisherToRemove = currentWishers.find((w) => w.userId === userId);

  if (wisherToRemove) {
    await updateDoc(postRef, {
      wishers: arrayRemove(wisherToRemove),
      updatedAt: Timestamp.now(),
    });
  }
}

// Add to collection (creates listing + adds to owners)
export async function addToCollection(
  postId: string,
  userId: string,
  displayName: string,
  email: string,
  photoURL: string,
  size: number,
  conditionGrade: number,
  tradeValue: number,
  location: string
): Promise<void> {
  // Create listing
  await createListing({
    postId,
    userId,
    userName: displayName,
    userRating: 5.0,
    size,
    condition: conditionGrade === 10 ? "new" : "used",
    conditionGrade,
    tradeValue,
    location,
    responseTime: "Usually responds within 24 hours",
    photos: [],
  });

  // Add to owners array
  const postRef = doc(db, "posts", postId);
  await updateDoc(postRef, {
    owners: arrayUnion({
      userId,
      displayName,
      email,
      userPhoto: photoURL || "",
      size,
      condition: conditionGrade,
    }),
    updatedAt: Timestamp.now(),
  });
}

// Subscribe to all active posts (real-time)
export function subscribeToPosts(
  callback: (posts: Post[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const postsRef = collection(db, "posts");
  const q = query(
    postsRef,
    where("active", "==", true),
    orderBy("postedAt", "desc")
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
}

// Subscribe to posts by brand (real-time)
export function subscribeToPostsByBrand(
  brand: string,
  callback: (posts: Post[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const postsRef = collection(db, "posts");
  const q = query(
    postsRef,
    where("active", "==", true),
    where("brand", "==", brand),
    orderBy("postedAt", "desc")
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
}

// Subscribe to a single post (real-time)
export function subscribeToPost(
  postId: string,
  callback: (post: Post | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
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
}

// Subscribe to listings for a post (real-time)
export function subscribeToListings(
  postId: string,
  callback: (listings: Listing[]) => void,
  filters?: {
    size?: number;
    condition?: "new" | "used";
  },
  onError?: (error: Error) => void
): Unsubscribe {
  const listingsRef = collection(db, "listings");

  // Build query with filters
  const constraints = [
    where("postId", "==", postId),
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
}

// One-time read operations (for when you don't need real-time)
// Get a single post by ID (one-time read)
export async function getPostById(postId: string): Promise<Post | null> {
  const postRef = doc(db, "posts", postId);
  const snapshot = await getDoc(postRef);

  if (!snapshot.exists()) return null;

  return {
    ...snapshot.data(),
    postId: snapshot.id,
  } as Post;
}

// Create or update a post
export async function createOrUpdatePost(postData: {
  styleId: string;
  title: string;
  brand: string;
  productImageUrl: string;
  userId: string;
}): Promise<string> {
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
    ...postData,
    wishers: [],
    owners: [],
    postedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    active: true,
    public: true,
  };

  const docRef = await addDoc(postsRef, newPost);
  return docRef.id;
}

// Create a listing
export async function createListing(listingData: {
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
  photos?: string[];
}): Promise<string> {
  const listingsRef = collection(db, "listings");

  const newListing: Partial<Listing> = {
    ...listingData,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(listingsRef, newListing);
  return docRef.id;
}

// Update an existing post's image URL
export async function updatePostImage(
  postId: string,
  firebaseImageUrl: string
): Promise<void> {
  const postRef = doc(db, "posts", postId);
  await updateDoc(postRef, {
    productImageUrl: firebaseImageUrl,
    updatedAt: Timestamp.now(),
  });
}

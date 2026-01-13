import { Timestamp } from "firebase/firestore";

export interface User {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  photoURL?: string;
  termsOfAgreement: boolean;
  mobile: string;
  biography: string;
  location: string;
  notification: boolean;
  numNotification: number;
  referredBy?: string;
  shoeSize?: number;
  numReferral: number;
  sneakerCount?: number;
  wishlistCount?: number;
  address?: Address;
  onboardingFinished: boolean;
}

export interface Address {
  street: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
}

export interface Sneaker {
  sneakerId?: string;
  productImageUrl: string;
  name: string;
  brand?: string;
  styleId?: string;
  apiID?: string;
  size?: number;
  condition?: number;
  fromCloset?: boolean;
  ogAll?: boolean;
  details?: {
    box: boolean;
    insoles: boolean;
    laces: boolean;
    flaws: string;
  };
  avgDSprice?: number;
  photos?: boolean;
}

export interface TradeOffer {
  cash: number;
  sneakers: Sneaker[];
}

export interface OfferHistory {
  theirOffer: TradeOffer;
  yourOffer: TradeOffer;
  initiatedBy: string;
}

export interface Trade {
  tradeId: string;
  theirOffer?: TradeOffer;
  yourOffer?: TradeOffer;
  offer?: OfferHistory[];
  add?: number;
  ask?: number;
  senderId: string;
  senderMobile: string;
  senderName: string;
  senderEmail: string;
  senderNewMsg: number;
  senderActive?: boolean;
  posterId: string;
  posterMobile: string;
  posterName: string;
  posterEmail: string;
  posterNewMsg: number;
  posterActive?: boolean;
  sentAt?: Timestamp;
  senderRead: boolean;
  posterRead: boolean;
  senderConfirm: boolean;
  posterConfirm: boolean;
  senderPaid: boolean;
  posterPaid: boolean;
  senderPaymentId?: string;
  posterPaymentId?: string;
  declined: boolean;
  reminderSent: boolean;
  tradeLikelihood?: number;
}

export interface UserReference {
  id: string;
  name: string;
  email: string;
  rating?: number;
}

export interface Post {
  postId: string;
  public?: boolean;
  userId?: string;
  wishers?: WisherOwner[];
  owners?: WisherOwner[];
  apiID?: string;
  styleId?: string;
  title: string;
  brand: string;
  productImageUrl: string;
  postedAt?: Timestamp;
  updatedAt?: Timestamp;
  active?: boolean;
  sneaks?: Sneaker[];
}

export interface TrackingInfo {
  carrier: string;
  tracking: string;
  label: string;
}

export interface Order {
  id: string;
  completed?: boolean;
  confirmedAt: Timestamp;
  poster: UserReference;
  sender: UserReference;
  users?: string[];
  tradeDeal: {
    senderOffer: TradeOffer;
    posterOffer: TradeOffer;
  };
  trackingSender?: TrackingInfo;
  trackingPoster?: TrackingInfo;
  trackingSole360?: TrackingInfo;
  fakes?: {
    userId: string;
    reasons: string;
  };
}

export interface Listing {
  id: string;
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
  hasBox?: boolean;
  hasInsoles?: boolean;
  hasLaces?: boolean;
  flaws?: string;

  photos?: {
    appearance?: string;
    boxLabel?: string;
    insoles?: string;
    boxFrontal?: string;
    insoleStitching?: string;
    dateCode?: string;
  };
  approvalStatus?: "pending" | "approved" | "rejected";
  createdAt: Timestamp;
}

export interface WisherOwner {
  userId: string;
  displayName: string;
  email: string;
  userPhoto: string;
  size: number;
  condition: number;
}

/**
 * Trade draft payload passed from Compose -> Review.
 *
 * Important constraints:
 * - No Firestore writes on Compose or Review (yet)
 * - Keep this payload minimal and UI-focused
 * - No "any" and no unused fields
 */

export interface TradeReviewYourItem {
  id: string; // listingId
  postId: string;
  name: string;
  size: string;
  value: string;
  imageUrl?: string;
  brand?: string;
  status?: "approved" | "pending" | "rejected";
}

export interface TradeReviewTheirItem {
  id: string; // listingId
  postId: string;
  userId: string;
  size: number;
  condition: "new" | "used";
  tradeValue: number;
  title: string;
  brand: string;
  imageUrl: string;
}

export interface TradeReviewDraft {
  // Needed to render the Review page without refetching
  yourItems: TradeReviewYourItem[];
  theirItems: TradeReviewTheirItem[];

  // Cash inputs
  addCash: number;
  askCash: number;

  // Summary numbers shown on Review
  netTotal: number;
  likelihood: number;
}

// ============================================
// API & External Service Types
// ============================================

/**
 * KicksDB API product response
 * Represents product data from StockX or GOAT
 */
export interface KicksDBProduct {
  // StockX fields
  id?: string;
  title?: string;
  image?: string;
  rank?: number;
  weekly_orders?: number;
  min_price?: number;
  max_price?: number;
  avg_price?: number;

  // GOAT fields (different names)
  name?: string;
  image_url?: string;

  // Common fields
  brand: string;
  model: string;
  sku: string;
  slug: string;
}

/**
 * Unified search result from KicksDB API
 * Normalized format for both StockX and GOAT results
 */
export interface SearchResult {
  id: string;
  name: string;
  brand: string;
  styleId: string;
  imageUrl: string;
  source: "stockx" | "goat";
  rank?: number;
  weekly_orders?: number;
  min_price?: number;
  max_price?: number;
  avg_price?: number;
}

/**
 * Image upload job for Firebase processing queue
 */
export interface ImageJob {
  postId: string;
  styleId: string;
  imageUrl: string;
  source: "stockx" | "goat";
  status: "pending" | "processing" | "complete" | "failed";
  createdAt?: any;
  error?: string;
  firebaseUrl?: string;
}

/**
 * Algolia search hit format
 */
export interface AlgoliaHit {
  objectID: string;
  title: string;
  brand: string;
  styleId?: string;
  productImageUrl: string;
}

// ============================================
// Collection & Wishlist Types
// ============================================

/**
 * User's collection item (listings they own)
 */
export interface MyCollectionItem {
  id: string; // listingId
  postId: string;
  name: string;
  size: string;
  value: string;
  imageUrl?: string;
  brand?: string;
  status?: "approved" | "pending" | "rejected";
  rank?: number;
  weekly_orders?: number;
  min_price?: number;
  max_price?: number;
  avg_price?: number;
}

/**
 * User's wishlist item (sneakers they want)
 */
export interface MyWishlistItem {
  id: string; // `${postId}_${size}`
  postId: string;
  name: string;
  brand?: string;
  imageUrl?: string;
  size: number;
  addedAt?: Timestamp;
}

/**
 * Collection item with optional post reference
 * Used in collection grid display
 */
export interface CollectionItem {
  id: string; // listingId
  postId: string;
  post?: Post;
  name: string;
  size: string;
  value: string;
  imageUrl?: string;
  status?: "approved" | "pending" | "rejected";
}

// ============================================
// Trade Composition Types
// ============================================

/**
 * Listing row for trade composition page
 * Includes post details for display
 */
export interface TheirListingRow {
  id: string;
  postId: string;
  userId: string;
  size: number;
  condition: "new" | "used";
  conditionGrade: number;
  tradeValue: number;
  approvalStatus?: "approved" | "pending" | "rejected";
  title: string;
  brand: string;
  imageUrl: string;
}

/**
 * Extended sneaker with all form data for add dialog
 */
export interface SelectedSneaker extends SearchResult {
  listingId?: string;
  size: string;
  condition: number;
  tradeValue: string;
  hasBox: boolean;
  hasInsoles: boolean;
  hasLaces: boolean;
  flaws: string;
  photos?: {
    appearance?: string;
    boxLabel?: string;
    insoles?: string;
    boxFrontal?: string;
    insoleStitching?: string;
    dateCode?: string;
  };
}

// ============================================
// UI & Navigation Types
// ============================================

/**
 * Brand filter options for dashboard
 */
export type BrandFilter =
  | "All"
  | "Nike"
  | "Adidas"
  | "Jordan"
  | "New Balance"
  | "Other";

/**
 * Profile tab keys
 */
export type ProfileTabKey = "collection" | "wishlist" | "fashion" | "trades";

// ============================================
// Context Types
// ============================================

/**
 * Authentication context interface
 */
export interface AuthContextType {
  currentUser: any; // Firebase User
  userProfile: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    userData: Partial<User>
  ) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUserProfile: (updates: Partial<User>) => Promise<void>;
  resendEmailVerification: () => Promise<void>;
}

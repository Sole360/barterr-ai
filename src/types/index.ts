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
  photos?: string[];
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

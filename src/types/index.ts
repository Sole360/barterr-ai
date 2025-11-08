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

export interface Trade {
  tradeId: string;
  theirOffer?: any;
  yourOffer?: any;
  offer?: any[];
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
  tradeLikelihood?: any;
}

export interface Post {
  postId: string;
  public?: boolean;
  userId?: string;
  wishers: any[];
  owners: any[];
  apiID?: string;
  styleId: string;
  title: string;
  brand: string;
  productImageUrl: string;
  postedAt: Timestamp;
  updatedAt: Timestamp;
  active: boolean;
  sneaks?: Sneaker[];
}

export interface Order {
  id: string;
  completed?: boolean;
  confirmedAt: any;
  poster: any;
  sender: any;
  users?: any[];
  tradeDeal: any;
  trackingSender?: any;
  trackingPoster?: any;
  trackingSole360?: any;
  fakes?: {
    userId: string;
    reasons: string;
  };
}

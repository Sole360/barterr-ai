import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./config";
import { useAuth } from "@/lib/contexts/auth.context";

export interface RecommendedListing {
  postId: string;
  brand: string;
  styleId: string;
  productName: string;
  productImageUrl: string;
  score: number;
}

export interface RecommendedPartner {
  userId: string;
  displayName: string;
  photoURL: string | null;
  score: number;
  sharedBrands: string[];
}

interface UseRecommendationsResult {
  listings: RecommendedListing[];
  partners: RecommendedPartner[];
  loading: boolean;
}

export function useRecommendations(): UseRecommendationsResult {
  const { currentUser } = useAuth();
  const [listings, setListings] = useState<RecommendedListing[]>([]);
  const [partners, setPartners] = useState<RecommendedPartner[]>([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [loadingPartners, setLoadingPartners] = useState(true);

  useEffect(() => {
    if (!currentUser?.uid) {
      setListings([]);
      setPartners([]);
      setLoadingListings(false);
      setLoadingPartners(false);
      return;
    }

    const uid = currentUser.uid;

    const unsubListings = onSnapshot(
      doc(db, `users/${uid}/cachedRecommendations/listings`),
      (snap) => {
        setListings(snap.exists() ? (snap.data()?.items ?? []) : []);
        setLoadingListings(false);
      },
      () => {
        setLoadingListings(false);
      }
    );

    const unsubPartners = onSnapshot(
      doc(db, `users/${uid}/cachedRecommendations/partners`),
      (snap) => {
        setPartners(snap.exists() ? (snap.data()?.items ?? []) : []);
        setLoadingPartners(false);
      },
      () => {
        setLoadingPartners(false);
      }
    );

    return () => {
      unsubListings();
      unsubPartners();
    };
  }, [currentUser?.uid]);

  return {
    listings,
    partners,
    loading: loadingListings || loadingPartners,
  };
}

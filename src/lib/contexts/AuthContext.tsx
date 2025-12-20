import { useEffect, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/config";
import type { User } from "@/types";
import { AuthContext, type AuthContextType } from "./auth.context";

type AuthProviderProps = { children: ReactNode };

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signIn: AuthContextType["signIn"] = async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email, password);

    if (!result.user.emailVerified) {
      await signOut(auth);
      throw new Error("Please verify your email before signing in.");
    }
  };

  const signUp: AuthContextType["signUp"] = async (
    email,
    password,
    userData
  ) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(result.user);

    const newUser: User = {
      uid: result.user.uid,
      email,
      firstName: userData.firstName ?? "",
      lastName: userData.lastName ?? "",
      displayName: `${userData.firstName ?? ""} ${
        userData.lastName ?? ""
      }`.trim(),
      photoURL: "",
      termsOfAgreement: true,
      mobile: userData.mobile ?? "",
      biography: "",
      location: "",
      notification: false,
      numNotification: 0,
      numReferral: 0,
      onboardingFinished: false,
      sneakerCount: 0,
      wishlistCount: 0,
    };

    if (userData.referredBy) newUser.referredBy = userData.referredBy;
    if (userData.shoeSize) newUser.shoeSize = userData.shoeSize;

    await setDoc(doc(db, "users", result.user.uid), newUser);

    await updateProfile(result.user, { displayName: newUser.displayName });
  };

  const resendEmailVerification: AuthContextType["resendEmailVerification"] =
    async () => {
      if (!auth.currentUser) throw new Error("No signed-in user");
      await sendEmailVerification(auth.currentUser);
    };

  const logout: AuthContextType["logout"] = async () => {
    await signOut(auth);
    setUserProfile(null);
  };

  const resetPassword: AuthContextType["resetPassword"] = async (email) => {
    await sendPasswordResetEmail(auth, email);
  };

  const updateUserProfile: AuthContextType["updateUserProfile"] = async (
    updates
  ) => {
    if (!currentUser) throw new Error("No user logged in");
    await setDoc(doc(db, "users", currentUser.uid), updates, { merge: true });
    // realtime listener updates userProfile automatically
  };

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setUserProfile(null);

      unsubscribeUserDoc?.();
      unsubscribeUserDoc = null;

      if (!user?.uid) {
        setLoading(false);
        return;
      }

      unsubscribeUserDoc = onSnapshot(doc(db, "users", user.uid), (snap) => {
        setUserProfile(snap.exists() ? (snap.data() as User) : null);
        setLoading(false);
      });
    });

    return () => {
      unsubscribeUserDoc?.();
      unsubscribeAuth();
    };
  }, []);

  const value: AuthContextType = {
    currentUser,
    userProfile,
    loading,
    signIn,
    signUp,
    logout,
    resetPassword,
    updateUserProfile,
    resendEmailVerification,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

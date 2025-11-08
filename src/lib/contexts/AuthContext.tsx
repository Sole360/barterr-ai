import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/config";
import { User } from "@/types";

interface AuthContextType {
  currentUser: FirebaseUser | null;
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch user profile from Firestore
  const fetchUserProfile = async (uid: string) => {
    try {
      const userDoc = await getDoc(doc(db, "users", uid));
      if (userDoc.exists()) {
        setUserProfile(userDoc.data() as User);
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  };

  // Sign in
  const signIn = async (email: string, password: string) => {
    const result = await signInWithEmailAndPassword(auth, email, password);

    if (!result.user.emailVerified) {
      await signOut(auth);
      throw new Error("Please verify your email before signing in.");
    }

    await fetchUserProfile(result.user.uid);
  };

  // Sign up
  const signUp = async (
    email: string,
    password: string,
    userData: Partial<User>
  ) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);

    // Send verification email
    await sendEmailVerification(result.user);

    // Create user profile in Firestore
    const newUser: User = {
      uid: result.user.uid,
      email: email,
      firstName: userData.firstName || "",
      lastName: userData.lastName || "",
      displayName: `${userData.firstName} ${userData.lastName}`,
      photoURL: "assets/images/logo-avi.jpg",
      termsOfAgreement: true,
      mobile: userData.mobile || "",
      biography: "",
      location: "",
      notification: false,
      numNotification: 0,
      referredBy: userData.referredBy || "",
      numReferral: 0,
      onboardingFinished: false,
      shoeSize: userData.shoeSize,
      sneakerCount: 0,
      wishlistCount: 0,
    };

    await setDoc(doc(db, "users", result.user.uid), newUser);

    // Update display name in Firebase Auth
    await updateProfile(result.user, {
      displayName: newUser.displayName,
    });
  };

  // Logout
  const logout = async () => {
    await signOut(auth);
    setUserProfile(null);
  };

  // Reset password
  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  // Update user profile
  const updateUserProfile = async (updates: Partial<User>) => {
    if (!currentUser) throw new Error("No user logged in");

    await setDoc(doc(db, "users", currentUser.uid), updates, { merge: true });

    if (userProfile) {
      setUserProfile({ ...userProfile, ...updates });
    }
  };

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        await fetchUserProfile(user.uid);
      } else {
        setUserProfile(null);
      }

      setLoading(false);
    });

    return unsubscribe;
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
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { currentUser, userProfile } = useAuth();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Redirect to onboarding if not finished
  if (userProfile && !userProfile.onboardingFinished) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

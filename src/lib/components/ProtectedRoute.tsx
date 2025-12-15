import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { currentUser, userProfile, loading } = useAuth();
  const location = useLocation();

  // Show nothing while loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  // Not logged in - redirect to login
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Logged in but no profile yet - this shouldn't happen but just in case
  if (!userProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading profile...</div>
      </div>
    );
  }

  // User is on onboarding page - allow it
  if (location.pathname === "/onboarding") {
    return <>{children}</>;
  }

  if (!currentUser.emailVerified) {
    return (
      <Navigate
        to={`/verify-email?email=${encodeURIComponent(
          currentUser.email ?? ""
        )}`}
        replace
      />
    );
  }

  // User hasn't finished onboarding and trying to access other pages - redirect to onboarding
  if (!userProfile.onboardingFinished) {
    return <Navigate to="/onboarding" replace />;
  }

  // All checks passed - show the protected content
  return <>{children}</>;
}

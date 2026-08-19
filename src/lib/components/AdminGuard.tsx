import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/contexts/auth.context";

export const AdminGuard = ({ children }: { children: React.ReactNode }) => {
  const { currentUser, adminRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!currentUser || !adminRole) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

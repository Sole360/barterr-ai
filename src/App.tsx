import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/lib/contexts/AuthContext";
import { ProtectedRoute } from "@/lib/components/ProtectedRoute";
import { LoginPage } from "@/app/auth/LoginPage";
import { SignupPage } from "@/app/auth/SignupPage";
import { OnboardingPage } from "@/app/auth/OnboardingPage";
import { DashboardPage } from "@/app/dashboard/DashboardPage";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <OnboardingPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

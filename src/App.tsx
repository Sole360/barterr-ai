import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/lib/contexts/AuthContext";
import { ProtectedRoute } from "@/lib/components/ProtectedRoute";
import { LoginPage } from "@/app/auth/LoginPage";
import { SignupPage } from "@/app/auth/SignupPage";
import { OnboardingPage } from "@/app/auth/OnboardingPage";
import { DashboardPage } from "@/app/dashboard/DashboardPage";
import { Toaster } from "@/components/ui/toaster";
import { ForgotPasswordPage } from "@/app/auth/ForgotPasswordPage";
import { VerifyEmailPage } from "@/app/auth/VerifyEmailPage";
import { ProfilePage } from "@/app/profile/ProfilePage";
import { TradesInboxPage } from "@/app/trades/TradesInboxPage";
import { TradeDetailPage } from "@/app/trades/TradeDetailPage";
import { TradeComposePage } from "@/app/trades/TradeComposePage";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route
            path="/trades"
            element={
              <ProtectedRoute>
                <TradesInboxPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/trades/new"
            element={
              <ProtectedRoute>
                <TradeComposePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/trades/:tradeId"
            element={
              <ProtectedRoute>
                <TradeDetailPage />
              </ProtectedRoute>
            }
          />

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
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { AuthProvider } from "@/lib/contexts/AuthContext";
import { ThemeProvider } from "@/lib/contexts/theme.context";
import { ProtectedRoute } from "@/lib/components/ProtectedRoute";
import { LoginPage } from "@/app/auth/LoginPage";
import { SignupPage } from "@/app/auth/SignupPage";
import { OnboardingPage } from "@/app/auth/OnboardingPage";
import { DashboardPage } from "@/app/dashboard/DashboardPage";
import { Toaster } from "@/components/ui/toaster";
import { ForgotPasswordPage } from "@/app/auth/ForgotPasswordPage";
import { VerifyEmailPage } from "@/app/auth/VerifyEmailPage";
import { ProfilePage } from "@/app/profile/ProfilePage";
import { PublicProfilePage } from "@/app/profile/PublicProfilePage";
import { TradesInboxPage } from "@/app/trades/TradesInboxPage";
import { TradeDetailPage } from "@/app/trades/TradeDetailPage";
import { TradeComposePage } from "@/app/trades/TradeComposePage";
import { TradeReviewPage } from "@/app/trades/TradeReviewPage";
import { TradePaymentMethodPage } from "./app/trades/TradePaymentMethodPage";

function AppRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/:userId" element={<PublicProfilePage />} />
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
          path="/trades/new/review"
          element={
            <ProtectedRoute>
              <TradeReviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trades/new/review/payment-method"
          element={<TradePaymentMethodPage />}
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
    </AnimatePresence>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;

import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { AuthProvider } from "@/lib/contexts/AuthContext";
import { ThemeProvider } from "@/lib/contexts/theme.context";
import { TourProvider } from "@/lib/contexts/tour.context";
import { AppTour } from "@/components/shared/AppTour";
import { ProtectedRoute } from "@/lib/components/ProtectedRoute";
import { AdminGuard } from "@/lib/components/AdminGuard";
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
import { TradeCounterPage } from "@/app/trades/TradeCounterPage";
import { MessagesInboxPage } from "@/app/messages/MessagesInboxPage";
import { MessageThreadPage } from "@/app/messages/MessageThreadPage";
import { AdminShell } from "@/app/admin/AdminShell";
import { AdminDashboard } from "@/app/admin/AdminDashboard";
import { FlaggedMessagesPage } from "@/app/admin/FlaggedMessagesPage";
import { ListingApprovalPage } from "@/app/admin/ListingApprovalPage";
import { UserManagementPage } from "@/app/admin/UserManagementPage";
import { AdminTradesPage } from "@/app/admin/AdminTradesPage";
import { AnnouncementsPage } from "@/app/admin/AnnouncementsPage";
import { ContentFilterPage } from "@/app/admin/ContentFilterPage";
import { AuditLogPage } from "@/app/admin/AuditLogPage";
import { OrderManagementPage } from "@/app/admin/OrderManagementPage";
import { RevenueDashboardPage } from "@/app/admin/RevenueDashboardPage";
import { AccountSettingsPage } from "@/app/account/AccountSettingsPage";
import { FindYourSizePage } from "@/app/find-your-size/FindYourSizePage";
import { DiscoverPage } from "@/app/discover/DiscoverPage";
import { LandingPage } from "@/app/marketing/LandingPage";
import { AboutPage } from "@/app/marketing/AboutPage";
import { PricingPage } from "@/app/marketing/PricingPage";
import { FAQPage } from "@/app/marketing/FAQPage";
import { TermsPage } from "@/app/marketing/TermsPage";
import { WalletPage } from "@/app/wallet/WalletPage";
import { FeaturebaseSSOPage } from "@/app/featurebase/FeaturebaseSSOPage";
import { ConsentBanner } from "@/components/shared/ConsentBanner";
import { trackPageView, normalizePath } from "@/lib/analytics/gtag";
import { useEffect } from "react";

// Sits directly under BrowserRouter (outside AuthProvider, which unmounts
// children until auth resolves) so every navigation is tracked.
function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPageView(normalizePath(location.pathname));
  }, [location.pathname]);
  return null;
}

function AppRoutes() {
  const location = useLocation();
  return (
    <>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/:userId" element={<PublicProfilePage />} />
          <Route
            path="/messages"
            element={<ProtectedRoute><MessagesInboxPage /></ProtectedRoute>}
          />
          <Route
            path="/messages/:conversationId"
            element={<ProtectedRoute><MessageThreadPage /></ProtectedRoute>}
          />
          <Route
            path="/trades"
            element={<ProtectedRoute><TradesInboxPage /></ProtectedRoute>}
          />
          <Route
            path="/trades/new"
            element={<ProtectedRoute><TradeComposePage /></ProtectedRoute>}
          />
          <Route
            path="/trades/new/review"
            element={<ProtectedRoute><TradeReviewPage /></ProtectedRoute>}
          />
          <Route
            path="/trades/new/review/payment-method"
            element={<TradePaymentMethodPage />}
          />
          <Route
            path="/trades/:tradeId"
            element={<ProtectedRoute><TradeDetailPage /></ProtectedRoute>}
          />
          <Route
            path="/trades/:tradeId/counter"
            element={<ProtectedRoute><TradeCounterPage /></ProtectedRoute>}
          />
          <Route
            path="/onboarding"
            element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>}
          />
          <Route
            path="/dashboard"
            element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
          />
          <Route
            path="/account"
            element={<ProtectedRoute><AccountSettingsPage /></ProtectedRoute>}
          />
          <Route
            path="/find-your-size"
            element={<ProtectedRoute><FindYourSizePage /></ProtectedRoute>}
          />
          <Route
            path="/discover"
            element={<ProtectedRoute><DiscoverPage /></ProtectedRoute>}
          />
          <Route
            path="/wallet"
            element={<ProtectedRoute><WalletPage /></ProtectedRoute>}
          />
          <Route
            path="/featurebase-sso"
            element={<ProtectedRoute><FeaturebaseSSOPage /></ProtectedRoute>}
          />

          {/* Admin — nested under AdminShell, all guarded by AdminGuard */}
          <Route
            path="/admin"
            element={<AdminGuard><AdminShell /></AdminGuard>}
          >
            <Route index element={<AdminDashboard />} />
            <Route path="flagged" element={<FlaggedMessagesPage />} />
            <Route path="listings" element={<ListingApprovalPage />} />
            <Route path="users" element={<UserManagementPage />} />
            <Route path="trades" element={<AdminTradesPage />} />
            <Route path="announcements" element={<AnnouncementsPage />} />
            <Route path="content-filter" element={<ContentFilterPage />} />
            <Route path="audit" element={<AuditLogPage />} />
            <Route path="orders" element={<OrderManagementPage />} />
            <Route path="revenue" element={<RevenueDashboardPage />} />
          </Route>

          {/* Marketing / public pages */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/faq" element={<FAQPage />} />
          <Route path="/terms" element={<TermsPage />} />
        </Routes>
      </AnimatePresence>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <RouteTracker />
      <ThemeProvider>
        <AuthProvider>
          <TourProvider>
            <AppRoutes />
            <AppTour />
            <Toaster />
          </TourProvider>
        </AuthProvider>
        <ConsentBanner />
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;

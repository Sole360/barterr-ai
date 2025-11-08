import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/lib/contexts/AuthContext";
import { ProtectedRoute } from "@/lib/components/ProtectedRoute";

// Placeholder components (we'll build these later)
function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-[#33FF99] to-[#3366FF]">
      <div className="bg-white p-8 rounded-lg shadow-xl">
        <h1 className="text-2xl font-bold mb-4">Login</h1>
        <p className="text-gray-600">Login page - coming soon</p>
      </div>
    </div>
  );
}

function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-[#33FF99] to-[#3366FF]">
      <div className="bg-white p-8 rounded-lg shadow-xl">
        <h1 className="text-2xl font-bold mb-4">Sign Up</h1>
        <p className="text-gray-600">Signup page - coming soon</p>
      </div>
    </div>
  );
}

function OnboardingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-[#33FF99] to-[#3366FF]">
      <div className="bg-white p-8 rounded-lg shadow-xl">
        <h1 className="text-2xl font-bold mb-4">Onboarding</h1>
        <p className="text-gray-600">Onboarding page - coming soon</p>
      </div>
    </div>
  );
}

function DashboardPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-[#33FF99] to-[#3366FF]">
      <div className="bg-white p-8 rounded-lg shadow-xl">
        <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
        <p className="text-gray-600">Dashboard page - coming soon</p>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* Onboarding (requires auth) */}
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <OnboardingPage />
              </ProtectedRoute>
            }
          />

          {/* Protected routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

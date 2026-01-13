import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/contexts/auth.context";

export const VerifyEmailPage = () => {
  const { currentUser, resendEmailVerification } = useAuth();
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [error, setError] = useState("");

  const location = useLocation();
  const emailFromQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("email") ?? "";
  }, [location.search]);

  const email = currentUser?.email ?? emailFromQuery;

  const onResend = async () => {
    try {
      setError("");
      setStatus("sending");
      await resendEmailVerification();
      setStatus("sent");
    } catch (e: any) {
      setError(e?.message ?? "Could not resend verification email");
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-r from-[#33FF99] to-[#3366FF] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md text-center space-y-4">
        <h1 className="text-3xl font-bold text-gray-900">Verify your email</h1>

        <p className="text-gray-600">
          We sent a verification link to{" "}
          <span className="font-semibold">{email || "your email"}</span>.
        </p>

        {status === "sent" && (
          <div className="p-3 bg-green-50 border border-green-200 text-green-800 rounded-md text-sm">
            Verification email resent.
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
            {error}
          </div>
        )}

        <Button
          onClick={onResend}
          className="w-full bg-[#3366FF] hover:bg-[#3366FF]/90"
          disabled={status === "sending"}
        >
          {status === "sending" ? "Sending..." : "Resend verification email"}
        </Button>

        <div className="text-sm text-gray-600">
          After verifying,{" "}
          <Link to="/login" className="text-[#3366FF] hover:underline">
            go back to Login
          </Link>
          .
        </div>
      </div>
    </div>
  );
};

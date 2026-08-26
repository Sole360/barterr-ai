import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/contexts/auth.context";
import { auth } from "@/lib/firebase/config";

export const VerifyEmailPage = () => {
  const { currentUser, resendEmailVerification } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  // Skip the page entirely if already verified (e.g. user navigated back here after verifying)
  useEffect(() => {
    if (auth.currentUser?.emailVerified) {
      navigate("/onboarding", { replace: true });
    }
  }, [navigate]);

  // Poll every 3s — Firebase won't update emailVerified without a reload()
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await auth.currentUser?.reload();
        if (auth.currentUser?.emailVerified) {
          clearInterval(interval);
          navigate("/onboarding", { replace: true });
        }
      } catch {
        // ignore transient network errors during poll
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [navigate]);

  const checkNow = async () => {
    setChecking(true);
    try {
      await auth.currentUser?.reload();
      if (auth.currentUser?.emailVerified) {
        navigate("/onboarding");
      } else {
        setError("Email not verified yet — check your inbox and click the link.");
      }
    } catch {
      setError("Couldn't check verification status. Try again.");
    } finally {
      setChecking(false);
    }
  };

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
      <div className="bg-card rounded-lg shadow-xl p-8 w-full max-w-md text-center space-y-4">
        <h1 className="text-3xl font-bold text-foreground">Verify your email</h1>

        <p className="text-muted-foreground">
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
          onClick={checkNow}
          disabled={checking}
          className="w-full"
          style={{
            backgroundImage: "linear-gradient(135deg, #33ff99 0%, #33c9bc 50%, #3366ff 100%)",
            color: "#fff",
          }}
        >
          {checking ? "Checking…" : "I've verified my email"}
        </Button>

        <Button
          variant="outline"
          onClick={onResend}
          className="w-full"
          disabled={status === "sending"}
        >
          {status === "sending" ? "Sending..." : "Resend verification email"}
        </Button>

        <div className="text-sm text-muted-foreground">
          <Link to="/login" className="text-[#3366FF] hover:underline">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
};

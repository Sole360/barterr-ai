import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/contexts/auth.context";

const GRADIENT_ICON = "https://firebasestorage.googleapis.com/v0/b/barterr-dev-98dfd.firebasestorage.app/o/public%2Fbarterr-icon-glyph-gradient.png?alt=media&token=1ebf5744-52b4-4d42-9673-a9799b5fb1c1";

export const MarketingLayout = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white dark:bg-background flex flex-col">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={GRADIENT_ICON} alt="Barterr" className="h-8 w-auto" />
            <span className="font-black text-xl tracking-tight text-foreground">Barterr</span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link to="/about" className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">About</Link>
            <Link to="/pricing" className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
            <Link to="/faq" className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">FAQ</Link>
          </div>

          <div className="flex items-center gap-3">
            {currentUser ? (
              <button
                onClick={() => navigate("/dashboard")}
                className="px-4 py-2 rounded-full text-sm font-bold text-white bg-gradient-to-r from-[#33FF99] to-[#3366FF] hover:opacity-90 transition-opacity shadow-md shadow-[#3366FF]/20"
              >
                Go to App
              </button>
            ) : (
              <>
                <Link to="/login" className="text-sm font-semibold text-foreground hover:text-[#3366FF] transition-colors">
                  Sign In
                </Link>
                <Link
                  to="/signup"
                  className="px-4 py-2 rounded-full text-sm font-bold text-white bg-gradient-to-r from-[#33FF99] to-[#3366FF] hover:opacity-90 transition-opacity shadow-md shadow-[#3366FF]/20"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="flex-1 pt-16">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-gradient-to-r from-[#33FF99] via-[#33c9bc] to-[#3366FF]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <img src={GRADIENT_ICON} alt="Barterr" className="h-8 w-auto brightness-0 invert" />
              <span className="font-black text-xl text-white tracking-tight">Barterr</span>
            </div>
            <div className="flex flex-wrap justify-center gap-6 text-sm font-semibold text-white/80">
              <Link to="/about" className="hover:text-white transition-colors">About</Link>
              <Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link>
              <Link to="/faq" className="hover:text-white transition-colors">FAQ</Link>
              <Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
              <a href="mailto:terrence@barterr.ai" className="hover:text-white transition-colors">Contact</a>
            </div>
            <p className="text-sm text-white/70">© 2026 Barterr. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, ArrowLeftRight, TrendingUp, PackageCheck, Lock, Star } from "lucide-react";
import { useAuth } from "@/lib/contexts/auth.context";
import { MarketingLayout } from "./MarketingLayout";

export const LandingPage = () => {
  const { currentUser, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && currentUser) navigate("/dashboard", { replace: true });
  }, [currentUser, loading, navigate]);

  if (loading || currentUser) return null;

  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="relative overflow-hidden bg-white dark:bg-background">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-[#33FF99]/20 to-[#3366FF]/20 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-[400px] h-[400px] rounded-full bg-gradient-to-tr from-[#3366FF]/10 to-[#33FF99]/10 blur-3xl" />
        </div>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-24 md:py-36 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#3366FF]/10 border border-[#3366FF]/20 text-[#3366FF] text-xs font-bold uppercase tracking-widest mb-6">
            <Star className="w-3 h-3" />
            Authentication Guaranteed
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-foreground tracking-tight leading-none mb-6">
            Trade sneakers
            <span className="block bg-gradient-to-r from-[#33FF99] to-[#3366FF] bg-clip-text text-transparent">
              with confidence.
            </span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Barterr is the only sneaker trading platform with built-in authentication, payment protection for both sides, and door-to-door shipping — so both traders are covered from start to finish.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/signup"
              className="px-8 py-4 rounded-2xl text-base font-black text-white bg-gradient-to-r from-[#33FF99] to-[#3366FF] hover:opacity-90 transition-opacity shadow-lg shadow-[#3366FF]/25"
            >
              Start Trading Today
            </Link>
            <Link
              to="/about"
              className="px-8 py-4 rounded-2xl text-base font-black text-foreground border border-border hover:border-[#3366FF]/50 transition-colors"
            >
              How It Works
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 dark:bg-card/30 py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-black text-foreground mb-3">Trade in 3 steps</h2>
            <p className="text-muted-foreground text-base max-w-xl mx-auto">From your first offer to your new pair — here's how it works.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: "01",
                icon: <ArrowLeftRight className="w-6 h-6 text-[#3366FF]" />,
                title: "Send a trade request",
                body: "Browse the marketplace, find a pair you want, and propose a trade from your own collection. Add a cash balance to make the deal fair.",
              },
              {
                step: "02",
                icon: <ShieldCheck className="w-6 h-6 text-[#3366FF]" />,
                title: "Both sides ship to Barterr",
                body: "Once both parties confirm, we send prepaid inbound labels. Your sneakers come to us first — nobody ships direct.",
              },
              {
                step: "03",
                icon: <PackageCheck className="w-6 h-6 text-[#3366FF]" />,
                title: "Authenticated. Shipped. Done.",
                body: "We verify every pair. If both pass, we send outbound labels and ship to your new owner. Your grail lands at your door.",
              },
            ].map(({ step, icon, title, body }) => (
              <div key={step} className="relative bg-white dark:bg-card rounded-3xl p-8 shadow-[0_2px_24px_rgba(0,0,0,0.06)] border border-border">
                <div className="absolute top-6 right-6 text-5xl font-black text-[#3366FF]/8 select-none">{step}</div>
                <div className="w-12 h-12 rounded-2xl bg-[#3366FF]/10 flex items-center justify-center mb-5">
                  {icon}
                </div>
                <h3 className="text-lg font-black text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature pillars */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-black text-foreground mb-3">Everything included. Nothing left to chance.</h2>
            <p className="text-muted-foreground text-base max-w-xl mx-auto">Your service fee covers the full trade experience end to end.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                icon: <ShieldCheck className="w-7 h-7 text-[#33c9bc]" />,
                title: "Authenticity guaranteed",
                body: "Every pair is verified by our team before it ships. If a sneaker fails, the trade stops — and you're protected.",
              },
              {
                icon: <Lock className="w-7 h-7 text-[#3366FF]" />,
                title: "Protected end to end",
                body: "Bilateral Stripe escrow holds both sides until authentication clears. Nobody's money moves until the shoes check out.",
              },
              {
                icon: <TrendingUp className="w-7 h-7 text-[#33FF99]" />,
                title: "Fair-trade algorithm",
                body: "Real market data scores every trade so neither side gets shorted. Know the value of what you're trading before you commit.",
              },
            ].map(({ icon, title, body }) => (
              <div key={title} className="bg-gray-50 dark:bg-card rounded-3xl p-8 border border-border">
                <div className="mb-4">{icon}</div>
                <h3 className="text-base font-black text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="py-20 bg-gradient-to-r from-[#33FF99] via-[#33c9bc] to-[#3366FF]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-black text-white mb-4">Use what you have to get what you want.</h2>
          <p className="text-white/80 text-base mb-8">Join the only sneaker marketplace where both sides are protected from offer to delivery.</p>
          <Link
            to="/signup"
            className="inline-block px-8 py-4 rounded-2xl text-base font-black text-[#3366FF] bg-white hover:bg-white/90 transition-colors shadow-lg"
          >
            Create Your Account
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
};

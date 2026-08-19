import { ArrowLeftRight, ShieldCheck, TrendingUp, PackageCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { MarketingLayout } from "./MarketingLayout";

export const AboutPage = () => (
  <MarketingLayout>
    {/* Hero */}
    <section className="bg-gradient-to-br from-[#33FF99] via-[#33c9bc] to-[#3366FF] py-24 text-center px-4">
      <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-4">Sneaker trading, made simple.</h1>
      <p className="text-white/80 text-lg max-w-2xl mx-auto">
        We believe trading is the most powerful way to grow your collection. Barterr gives you the infrastructure to do it safely.
      </p>
    </section>

    {/* Mission */}
    <section className="py-20 bg-white dark:bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <h2 className="text-2xl md:text-3xl font-black text-foreground mb-5">Our mission</h2>
        <p className="text-muted-foreground text-base leading-relaxed mb-6">
          Sneaker trading has always existed — but it's always been risky. Fakes, no-shows, and shady meetups meant that the person with fewer options usually got burned.
        </p>
        <p className="text-muted-foreground text-base leading-relaxed mb-6">
          Barterr flips that. We're the middleman that neither side has to trust blindly — because our platform does the work. Authentication happens at our facility. Escrow holds both sides accountable. Shipping is handled with prepaid labels. You trade the sneaker; we handle everything else.
        </p>
        <p className="text-foreground font-bold text-base">
          Use what you have to get what you want.
        </p>
      </div>
    </section>

    {/* How it works */}
    <section className="bg-gray-50 dark:bg-card/30 py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl font-black text-foreground text-center mb-12">Trade with 3 easy steps</h2>
        <div className="space-y-6">
          {[
            {
              step: "1",
              icon: <ArrowLeftRight className="w-6 h-6 text-white" />,
              title: "Send trade requests",
              body: "Use our dashboard, sneaker catalog, and exclusive trading interface to find and send trade requests. Add a cash balance to even things out. Counter-offer if the first proposal isn't right.",
            },
            {
              step: "2",
              icon: <ShieldCheck className="w-6 h-6 text-white" />,
              title: "Review offers & confirm",
              body: "Use our trading panel to discuss details and confirm safely. Once both sides agree, Stripe authorizes payment from both parties — funds are held in escrow until the trade clears authentication.",
            },
            {
              step: "3",
              icon: <PackageCheck className="w-6 h-6 text-white" />,
              title: "Ship sneakers for authentication",
              body: "We send prepaid inbound shipping labels to both traders. Once both pairs arrive at our facility, our team authenticates each sneaker. If both pass, we ship outbound to each party's address.",
            },
          ].map(({ step, icon, title, body }) => (
            <div key={step} className="flex gap-6 bg-white dark:bg-card rounded-3xl p-7 border border-border shadow-[0_2px_16px_rgba(0,0,0,0.05)]">
              <div className="shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-[#33FF99] to-[#3366FF] flex items-center justify-center">
                {icon}
              </div>
              <div>
                <h3 className="text-base font-black text-foreground mb-1.5">{step}. {title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Three pillars */}
    <section className="py-20 bg-white dark:bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl font-black text-foreground text-center mb-12">What sets us apart</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            {
              icon: <ShieldCheck className="w-7 h-7 text-[#33c9bc]" />,
              title: "Authenticity guaranteed",
              body: "Every pair is verified by our team before it changes hands. We don't ship a sneaker we haven't checked.",
            },
            {
              icon: <TrendingUp className="w-7 h-7 text-[#3366FF]" />,
              title: "Fair-trade algorithm",
              body: "Real market data scores every trade so nobody gets shorted. Know the value of your deal before you commit.",
            },
            {
              icon: <ArrowLeftRight className="w-7 h-7 text-[#33FF99]" />,
              title: "Protected end to end",
              body: "Stripe escrow holds both sides until authentication clears. No risk. No surprises. No one walks away empty-handed.",
            },
          ].map(({ icon, title, body }) => (
            <div key={title} className="bg-gray-50 dark:bg-card rounded-3xl p-7 border border-border">
              <div className="mb-4">{icon}</div>
              <h3 className="text-base font-black text-foreground mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* CTA */}
    <section className="py-16 bg-gradient-to-r from-[#33FF99] via-[#33c9bc] to-[#3366FF] text-center px-4">
      <h2 className="text-3xl font-black text-white mb-4">Ready to start trading?</h2>
      <Link
        to="/signup"
        className="inline-block px-8 py-4 rounded-2xl font-black text-[#3366FF] bg-white hover:bg-white/90 transition-colors shadow-lg"
      >
        Start Trading Today
      </Link>
    </section>
  </MarketingLayout>
);

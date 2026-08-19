import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { MarketingLayout } from "./MarketingLayout";

const tiers = [
  { count: "1 sneaker", price: "$40" },
  { count: "2 sneakers", price: "$50" },
  { count: "3 sneakers", price: "$60" },
  { count: "4 sneakers", price: "$70" },
  { count: "5+ sneakers", price: "$80" },
];

const included = [
  "Prepaid inbound shipping label",
  "Expert authentication at our facility",
  "Bilateral Stripe escrow protection",
  "Outbound shipping to your trade partner",
  "In-app DM & trade negotiation",
  "Real-time trade status tracking",
];

export const PricingPage = () => (
  <MarketingLayout>
    {/* Hero */}
    <section className="bg-gradient-to-br from-[#33FF99] via-[#33c9bc] to-[#3366FF] py-24 text-center px-4">
      <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-4">Simple, flat-rate pricing.</h1>
      <p className="text-white/80 text-lg max-w-xl mx-auto">
        One fee per trader covers everything — shipping in, authentication, and shipping out. Confirm your trade, pay once, we handle the rest.
      </p>
    </section>

    {/* Tiers */}
    <section className="py-20 bg-white dark:bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <h2 className="text-2xl font-black text-foreground text-center mb-10">Fee per trader</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {tiers.map(({ count, price }, i) => (
            <div
              key={count}
              className={`rounded-3xl border p-6 text-center flex flex-col items-center gap-2 ${
                i === 0
                  ? "border-[#3366FF] bg-[#3366FF]/5 shadow-[0_0_0_2px_#3366FF]"
                  : "border-border bg-gray-50 dark:bg-card"
              }`}
            >
              <div className="text-3xl font-black text-foreground">{price}</div>
              <div className="text-xs font-semibold text-muted-foreground">{count}</div>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground mt-5">
          +$10 per additional sneaker. Payment processing fees (Stripe) applied at checkout.
        </p>
      </div>
    </section>

    {/* What's included */}
    <section className="py-20 bg-gray-50 dark:bg-card/30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h2 className="text-2xl font-black text-foreground text-center mb-10">What's included in every trade</h2>
        <div className="bg-white dark:bg-card rounded-3xl border border-border p-8 shadow-[0_2px_24px_rgba(0,0,0,0.06)]">
          <ul className="space-y-4">
            {included.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <div className="shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-[#33FF99] to-[#3366FF] flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                </div>
                <span className="text-sm font-semibold text-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>

    {/* How payment works */}
    <section className="py-20 bg-white dark:bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h2 className="text-2xl font-black text-foreground text-center mb-8">How payment works</h2>
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            When you confirm a trade, Barterr places an <strong className="text-foreground">authorization hold</strong> on your card via Stripe — this covers your service fee plus any agreed cash balance. Your card is not charged yet.
          </p>
          <p>
            The hold is only <strong className="text-foreground">captured</strong> once both sneakers have arrived at our facility and passed authentication. If the trade doesn't complete for any reason, holds are released.
          </p>
          <p>
            If a sneaker <strong className="text-foreground">fails authentication</strong>, the trade is cancelled. The party who submitted the inauthentic sneaker forfeits their service fee and is charged for return shipping and a handling penalty. The legitimate party's hold is fully released.
          </p>
          <p>
            If one party <strong className="text-foreground">fails to ship</strong> within the required window, the trade is cancelled. The non-shipping party forfeits their service fee. Any shipped sneakers are returned at no cost to the shipping party.
          </p>
        </div>
      </div>
    </section>

    {/* CTA */}
    <section className="py-16 bg-gradient-to-r from-[#33FF99] via-[#33c9bc] to-[#3366FF] text-center px-4">
      <h2 className="text-3xl font-black text-white mb-4">Ready to make your first trade?</h2>
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Link
          to="/signup"
          className="inline-block px-8 py-4 rounded-2xl font-black text-[#3366FF] bg-white hover:bg-white/90 transition-colors shadow-lg"
        >
          Get Started Free
        </Link>
        <Link
          to="/faq"
          className="inline-block px-8 py-4 rounded-2xl font-black text-white border-2 border-white/60 hover:border-white transition-colors"
        >
          Read the FAQ
        </Link>
      </div>
    </section>
  </MarketingLayout>
);

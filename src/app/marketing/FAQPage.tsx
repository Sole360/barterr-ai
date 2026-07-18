import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { MarketingLayout } from "./MarketingLayout";

const faqs = [
  {
    q: "How do trades on Barterr work?",
    a: "You browse the marketplace, find a sneaker you want, and send a trade request from your own collection. You can include a cash balance to make the trade fair. Once both parties agree, Stripe places an authorization hold on both sides. We send prepaid inbound shipping labels — both sneakers come to Barterr first. After authentication passes on both sides, we ship outbound to each trader's address.",
  },
  {
    q: "What does the service fee cover?",
    a: "Your flat-rate fee covers everything: your prepaid inbound shipping label, expert authentication at our facility, payment protection for both sides, and your outbound shipping label to your trade partner. No hidden costs.",
  },
  {
    q: "How is pricing calculated?",
    a: "Pricing is tiered by the number of sneakers you're offering: 1 sneaker = $40, 2 = $50, 3 = $60, 4 = $70, 5+ = $80. Both traders pay independently. Stripe processing fees are applied at checkout. See our Pricing page for the full breakdown.",
  },
  {
    q: "How does the cash balance work?",
    a: "If the sneakers in a trade aren't equal value, the trader offering the lower-value sneaker can add a cash balance to even things out. This amount is also held in escrow and released to the other party when the trade completes.",
  },
  {
    q: "What happens if a sneaker fails authentication?",
    a: "If a sneaker fails our authentication process, the trade is cancelled. The party who submitted the inauthentic sneaker forfeits their service fee and is charged for return shipping and a handling penalty — consistent with industry standards (StockX, GOAT). The legitimate party's escrow hold is fully released. We give the flagged party 2 business days to provide clarification before the cancellation is finalized.",
  },
  {
    q: "What if one party doesn't ship their sneakers?",
    a: "If one trader fails to ship within the required timeframe, the trade is cancelled. The non-shipping party forfeits their service fee as a no-show penalty. If the other trader has already shipped, Barterr purchases a return label and sends their sneaker back at no cost to them.",
  },
  {
    q: "When does Barterr actually charge my card?",
    a: "We place an authorization hold (not a charge) when you confirm a trade. Your card is only captured once both sneakers have arrived at our facility and passed authentication. If a trade doesn't complete, the hold is released.",
  },
  {
    q: "How do I rate my sneaker's condition?",
    a: "When listing a sneaker, describe its condition honestly. Our team will verify the condition at authentication. If a sneaker arrives in materially worse condition than listed, the trade may be flagged. Accurate descriptions keep trades smooth for everyone.",
  },
  {
    q: "Can I counter-offer a trade?",
    a: "Yes. If you receive a trade request that isn't quite right, you can send a counter-offer with different items or a different cash balance. Counter-offers go back and forth through the app until both sides agree — or one side declines.",
  },
  {
    q: "What payment methods are accepted?",
    a: "Barterr uses Stripe for all payments. You can pay with any major credit or debit card. Cards are saved securely to your account via Stripe's infrastructure and can be managed in your account settings.",
  },
  {
    q: "How do I contact Barterr support?",
    a: "Email us at terrence@barterr.ai and we'll get back to you as soon as possible. For trade disputes, always reach out before taking any action — we're here to help both sides.",
  },
];

const FAQItem = ({ q, a }: { q: string; a: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 py-5 text-left"
      >
        <span className="text-sm font-bold text-foreground">{q}</span>
        <ChevronDown
          className={`shrink-0 w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <p className="pb-5 text-sm text-muted-foreground leading-relaxed pr-8">{a}</p>
      )}
    </div>
  );
};

export const FAQPage = () => (
  <MarketingLayout>
    {/* Hero */}
    <section className="bg-gradient-to-br from-[#33FF99] via-[#33c9bc] to-[#3366FF] py-24 text-center px-4">
      <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-4">Frequently asked questions</h1>
      <p className="text-white/80 text-lg max-w-xl mx-auto">
        Everything you need to know about trading on Barterr. Can't find your answer? Email us.
      </p>
    </section>

    {/* FAQ list */}
    <section className="py-20 bg-white dark:bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="bg-white dark:bg-card rounded-3xl border border-border shadow-[0_2px_24px_rgba(0,0,0,0.06)] divide-y-0 px-8">
          {faqs.map(({ q, a }) => (
            <FAQItem key={q} q={q} a={a} />
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground mb-4">Still have questions?</p>
          <a
            href="mailto:terrence@barterr.ai"
            className="inline-block px-6 py-3 rounded-2xl text-sm font-black text-white bg-gradient-to-r from-[#33FF99] to-[#3366FF] hover:opacity-90 transition-opacity shadow-md shadow-[#3366FF]/20"
          >
            Contact Us
          </a>
        </div>
      </div>
    </section>

    {/* Bottom links */}
    <section className="py-12 bg-gray-50 dark:bg-card/30 border-t border-border">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 flex flex-wrap justify-center gap-6">
        <Link to="/pricing" className="text-sm font-bold text-[#3366FF] hover:underline">View Pricing →</Link>
        <Link to="/about" className="text-sm font-bold text-[#3366FF] hover:underline">How It Works →</Link>
        <Link to="/terms" className="text-sm font-bold text-[#3366FF] hover:underline">Terms of Service →</Link>
      </div>
    </section>
  </MarketingLayout>
);

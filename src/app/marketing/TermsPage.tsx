import { MarketingLayout } from "./MarketingLayout";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-10">
    <h2 className="text-base font-black text-foreground mb-3">{title}</h2>
    <div className="text-sm text-muted-foreground leading-relaxed space-y-3">{children}</div>
  </div>
);

export const TermsPage = () => (
  <MarketingLayout>
    {/* Hero */}
    <section className="bg-gradient-to-br from-[#33FF99] via-[#33c9bc] to-[#3366FF] py-20 text-center px-4">
      <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-3">Terms of Service</h1>
      <p className="text-white/80 text-base">Last updated: January 1, 2026</p>
    </section>

    {/* Body */}
    <section className="py-20 bg-white dark:bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">

        <Section title="1. Agreement">
          <p>
            Barterr Inc. ("Barterr", "we", "us", or "our") provides a marketplace for trading sneakers through our website and mobile application (the "Service"). By creating an account or using the Service, you agree to these Terms of Service ("Terms") and all policies referenced herein. We will notify users when Terms are updated.
          </p>
        </Section>

        <Section title="2. Intellectual Property">
          <p>
            Logos, source code, and illustrations are the intellectual property of Barterr Inc. You may not use our branding for commercial purposes without written permission. We do not claim ownership of sneaker images or market data sourced from external databases.
          </p>
        </Section>

        <Section title="3. The Marketplace">
          <p>
            Barterr is a peer-to-peer sneaker trading marketplace. Our platform enables users to propose, negotiate, and complete sneaker trades with other verified users. All trade communication must occur through the Barterr in-app messaging system. Trades arranged outside the platform — through social media, text, or any other channel — are not covered by our Service and Barterr bears no responsibility for those transactions.
          </p>
          <p>
            Barterr is not a buyer or seller. We act as a neutral third party: authenticating sneakers, facilitating escrow, and coordinating logistics. We moderate trades to protect both parties.
          </p>
        </Section>

        <Section title="4. Account Creation">
          <p>
            By creating an account, you authorize Barterr to process and utilize the data you provide to operate the Service. Barterr will not sell your personal data to third parties. You are responsible for maintaining the security of your account credentials.
          </p>
        </Section>

        <Section title="5. Fees">
          <p>
            Barterr charges a tiered service fee to each party in a trade, based on the number of sneakers offered:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>1 sneaker: $40</li>
            <li>2 sneakers: $50</li>
            <li>3 sneakers: $60</li>
            <li>4 sneakers: $70</li>
            <li>5 or more sneakers: $80</li>
          </ul>
          <p>
            Stripe payment processing fees are added at checkout. When you confirm a trade, Barterr places an authorization hold on your payment method via Stripe. This hold covers your service fee plus any agreed cash balance. Your card is only <strong className="text-foreground">charged</strong> once both sneakers have arrived at our facility and passed authentication. If the trade does not complete, all holds are released.
          </p>
          <p>
            Barterr reserves the right to update fee structures. Users will be notified of changes via email or an in-app announcement prior to any change taking effect.
          </p>
        </Section>

        <Section title="6. Authentication & Cancellation Policy">
          <p>
            All sneakers must be shipped to Barterr's facility for authentication before any trade is finalized. Barterr will verify the condition and authenticity of each sneaker received.
          </p>
          <p>
            <strong className="text-foreground">Authentication failure:</strong> If a sneaker fails authentication, the trade is cancelled. The party who submitted the inauthentic sneaker will: (a) forfeit their service fee; (b) be charged a penalty fee consistent with industry standards; and (c) be responsible for the cost of return shipping of their item. The party who submitted a legitimate sneaker will have all holds fully released. Barterr will provide the flagged party 2 business days to submit clarification or evidence before the cancellation is finalized.
          </p>
          <p>
            <strong className="text-foreground">No-show / failure to ship:</strong> If one party fails to ship their sneaker within the required timeframe, the trade is cancelled. The non-shipping party forfeits their service fee as a no-show penalty. If the other party has already shipped, Barterr will arrange and pay for a return label, funded from the forfeited fee.
          </p>
        </Section>

        <Section title="7. Trader Obligations">
          <p>
            By confirming a trade through the Service, each trader enters a binding agreement to:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Ship the specified sneakers to Barterr's mailing address within the required window;</li>
            <li>Accurately represent the condition and quantity of items as listed;</li>
            <li>Ensure all items are genuine and not counterfeit;</li>
            <li>Conduct all trade-related communication through Barterr's platform.</li>
          </ul>
          <p>
            Any trade where a party ships directly to the other trader, or where items differ materially from the listing, violates these Terms. Barterr is not responsible for any transaction that bypasses the Service.
          </p>
        </Section>

        <Section title="8. Prohibited Conduct">
          <p>
            You may not use the Service to:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Submit counterfeit or stolen sneakers;</li>
            <li>Attempt to conduct transactions off-platform;</li>
            <li>Harass, threaten, or abuse other users;</li>
            <li>Create multiple accounts to circumvent suspensions or bans;</li>
            <li>Manipulate the fair-trade scoring algorithm;</li>
            <li>Engage in any fraudulent activity.</li>
          </ul>
          <p>
            Violations may result in account suspension, permanent ban, and/or legal action. Barterr uses automated content filtering and manual review to enforce these rules.
          </p>
        </Section>

        <Section title="9. Limitation of Liability">
          <p>
            Barterr is not responsible for lost, damaged, or delayed items in transit. Barterr is not responsible for the trading of unauthorized products, though we take reasonable steps to detect and prevent this. Barterr is not liable for any indirect, incidental, or consequential damages arising from use of the Service. Our total liability to any user shall not exceed the service fees paid by that user in the 90 days prior to the claim.
          </p>
        </Section>

        <Section title="10. Dispute Resolution">
          <p>
            All disputes between Barterr and users will be resolved through binding arbitration. Both parties waive the right to a trial by jury. Disputes must be submitted to Barterr at <a href="mailto:terrence@barterr.ai" className="text-[#3366FF] hover:underline">terrence@barterr.ai</a> before any arbitration proceeding begins. Barterr reserves the right to assess additional charges for any extra shipping or handling costs incurred during a dispute.
          </p>
        </Section>

        <Section title="11. Termination">
          <p>
            Barterr reserves the right to suspend or permanently terminate any account at our discretion. Grounds include, but are not limited to: submission of counterfeit goods, off-platform solicitation, harassment of other users, or repeated Terms violations. If termination occurs due to fraud or submission of stolen goods, Barterr reserves the right to charge the user for damages or $100.00, whichever is greater.
          </p>
        </Section>

        <Section title="12. General">
          <p>
            By using Barterr, you agree to the entirety of these Terms. Barterr may update the Service and these Terms at any time. We will notify active users of material changes via email or an in-app announcement. Continued use of the Service following notification constitutes acceptance of the updated Terms. To opt out, you must deactivate your account and contact us at <a href="mailto:terrence@barterr.ai" className="text-[#3366FF] hover:underline">terrence@barterr.ai</a>.
          </p>
        </Section>

      </div>
    </section>
  </MarketingLayout>
);

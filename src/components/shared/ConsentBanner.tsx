import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getStoredConsent, updateConsent } from "@/lib/analytics/gtag";

/**
 * Minimal cookie-consent bar for GA4 / Google Ads (Consent Mode v2).
 * Renders only until the user makes a choice; the choice persists in
 * localStorage and is replayed into gtag on every page load.
 */
export const ConsentBanner = () => {
  const [choice, setChoice] = useState(getStoredConsent);

  if (choice || !import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) return null;

  const decide = (granted: boolean) => {
    const value = granted ? "granted" : "denied";
    updateConsent(value);
    setChoice(value);
  };

  return (
    <div className="fixed bottom-0 inset-x-0 z-[100] border-t border-border bg-card px-4 py-3 shadow-lg">
      <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <p className="text-xs text-muted-foreground flex-1">
          We use cookies to understand how Barterr is used and to measure our
          ads. You can trade either way.
        </p>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => decide(false)}>
            Decline
          </Button>
          <Button
            size="sm"
            className="bg-[#3366FF] hover:bg-[#3366FF]/90"
            onClick={() => decide(true)}
          >
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
};

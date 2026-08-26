import { Joyride, STATUS, type EventData, type Step } from "react-joyride";
import { useTour } from "@/lib/contexts/tour.context";
import { useAuth } from "@/lib/contexts/auth.context";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

const STEPS_DESKTOP: Step[] = [
  {
    target: "body",
    title: "Welcome to Barterr!",
    content: "Let us show you the highlights in 5 quick steps.",
    placement: "center",
    skipBeacon: true,
  },
  {
    target: "[data-tour='listings']",
    title: "Discover sneakers",
    content:
      "Browse sneakers other traders have listed. Click any card to see details and send a trade offer.",
    skipBeacon: true,
    placement: "bottom",
  },
  {
    target: "[data-tour='add-sneaker-desktop']",
    title: "Add your sneakers",
    content:
      "Click the + button to list sneakers from your collection. Once approved, they'll appear in the marketplace.",
    skipBeacon: true,
    placement: "left",
  },
  {
    target: "[data-tour='trades-desktop']",
    title: "Your trades",
    content:
      "All your active trade requests live here. Accept, counter, or decline offers from other traders.",
    skipBeacon: true,
    placement: "bottom",
  },
  {
    target: "[data-tour='messages-desktop']",
    title: "Direct messages",
    content:
      "Message any trader directly to ask questions or negotiate before committing to a trade.",
    skipBeacon: true,
    placement: "bottom",
  },
  {
    target: "[data-tour='notifications-desktop']",
    title: "Notification center",
    content:
      "Stay in the loop on every trade action — offers received, accepted, and completed.",
    skipBeacon: true,
    placement: "bottom",
  },
  {
    target: "[data-tour='profile-desktop']",
    title: "Your profile",
    content:
      "View your public profile, manage your sneaker closet, and access account settings — all from here.",
    skipBeacon: true,
    placement: "bottom",
  },
];

const STEPS_MOBILE: Step[] = [
  {
    target: "body",
    title: "Welcome to Barterr!",
    content: "Let us show you the highlights in 5 quick steps.",
    placement: "center",
    skipBeacon: true,
  },
  {
    target: "[data-tour='listings']",
    title: "Discover sneakers",
    content:
      "Browse sneakers other traders have listed. Tap any card to see details and send a trade offer.",
    skipBeacon: true,
    placement: "bottom",
  },
  {
    target: "[data-tour='add-sneaker-mobile']",
    title: "Add your sneakers",
    content:
      "Tap + to list sneakers from your collection. Once approved, they'll appear in the marketplace.",
    skipBeacon: true,
    placement: "top",
  },
  {
    target: "[data-tour='trades-mobile']",
    title: "Your trades",
    content:
      "All your active trade requests live here. Accept, counter, or decline offers.",
    skipBeacon: true,
    placement: "top",
  },
  {
    target: "[data-tour='messages-mobile']",
    title: "Direct messages",
    content:
      "Message any trader directly to ask questions or negotiate before committing.",
    skipBeacon: true,
    placement: "top",
  },
  {
    target: "[data-tour='notifications-mobile']",
    title: "Notification center",
    content:
      "Stay in the loop on every trade action — offers received, accepted, and completed.",
    skipBeacon: true,
    placement: "bottom",
  },
  {
    target: "[data-tour='profile-mobile']",
    title: "Your profile",
    content:
      "View your public profile, manage your sneaker closet, and access account settings — all from here.",
    skipBeacon: true,
    placement: "top",
  },
];

export const AppTour = () => {
  const { isRunning, stopTour } = useTour();
  const { currentUser } = useAuth();

  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 767px)").matches;

  const steps = isMobile ? STEPS_MOBILE : STEPS_DESKTOP;

  const handleEvent = async (data: EventData) => {
    const { status } = data;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      stopTour();
      if (currentUser) {
        try {
          await updateDoc(doc(db, "users", currentUser.uid), {
            hasSeenTour: true,
          });
        } catch {
          // non-blocking
        }
      }
    }
  };

  return (
    <Joyride
      steps={steps}
      run={isRunning}
      onEvent={handleEvent}
      continuous
      scrollToFirstStep
      options={{
        showProgress: true,
        skipBeacon: true,
        primaryColor: "#3366FF",
        zIndex: 10000,
        overlayClickAction: false,
        buttons: ["back", "skip", "primary"],
        spotlightRadius: 12,
      }}
      styles={{
        tooltip: {
          borderRadius: 16,
          padding: "20px 24px",
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
        },
        tooltipContent: {
          padding: "0 0 4px 0",
          fontSize: 14,
          color: "#374151",
        },
        tooltipTitle: {
          fontSize: 16,
          fontWeight: 700,
          marginBottom: 6,
          color: "#111827",
        },
        buttonPrimary: {
          borderRadius: 8,
          padding: "8px 20px",
          fontWeight: 600,
          fontSize: 13,
        },
        buttonBack: {
          borderRadius: 8,
          padding: "8px 16px",
          fontSize: 13,
          color: "#6b7280",
          marginRight: 4,
        },
        buttonSkip: {
          fontSize: 13,
          color: "#9ca3af",
        },
      }}
      locale={{
        back: "Back",
        last: "Finish",
        next: "Next →",
        skip: "Skip tour",
      }}
    />
  );
};

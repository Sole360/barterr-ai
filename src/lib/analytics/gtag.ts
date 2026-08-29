/**
 * Google Analytics 4 (+ Google Ads) via gtag.js, with Consent Mode v2.
 *
 * GA4 uses the Firebase project's measurement ID (VITE_FIREBASE_MEASUREMENT_ID).
 * VITE_GOOGLE_ADS_ID is optional — when set, conversions also flow to Google Ads.
 * Everything is a no-op when the measurement ID is absent (e.g. local dev).
 */

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

const GA_ID = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;
const ADS_ID = import.meta.env.VITE_GOOGLE_ADS_ID;

const CONSENT_STORAGE_KEY = "barterr_analytics_consent";

const enabled = () => Boolean(GA_ID) && typeof window !== "undefined";

let gtagFn: ((...args: unknown[]) => void) | null = null;

export type ConsentChoice = "granted" | "denied";

export function getStoredConsent(): ConsentChoice | null {
  try {
    const v = localStorage.getItem(CONSENT_STORAGE_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

function consentPayload(choice: ConsentChoice) {
  return {
    ad_storage: choice,
    ad_user_data: choice,
    ad_personalization: choice,
    analytics_storage: choice,
  };
}

export function initAnalytics() {
  if (!enabled() || gtagFn) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  gtagFn = window.gtag;

  // Consent Mode v2 — defaults must be set before any config call.
  // Denied until the user accepts; GA still sends cookieless pings.
  gtagFn("consent", "default", consentPayload(getStoredConsent() ?? "denied"));

  gtagFn("js", new Date());
  gtagFn("config", GA_ID, { send_page_view: false });
  if (ADS_ID) gtagFn("config", ADS_ID);

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);
}

export function updateConsent(choice: ConsentChoice) {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, choice);
  } catch {
    // storage unavailable — consent still applies for this session
  }
  if (!gtagFn) return;
  gtagFn("consent", "update", consentPayload(choice));
}

export function trackPageView(path: string) {
  if (!gtagFn) return;
  gtagFn("event", "page_view", {
    page_path: path,
    page_location: window.location.origin + path,
  });
}

export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (!gtagFn) return;
  gtagFn("event", name, params ?? {});
}

export function setAnalyticsUser(uid: string | null) {
  if (!gtagFn) return;
  gtagFn("set", { user_id: uid });
}

/**
 * Collapses dynamic route segments so GA page paths stay low-cardinality
 * (/trades/abc123 → /trades/:tradeId).
 */
export function normalizePath(path: string): string {
  if (/^\/profile\/./.test(path)) return "/profile/:userId";
  if (/^\/messages\/./.test(path)) return "/messages/:conversationId";
  const trade = path.match(/^\/trades\/([^/]+)(\/counter)?$/);
  if (trade && trade[1] !== "new") {
    return trade[2] ? "/trades/:tradeId/counter" : "/trades/:tradeId";
  }
  return path;
}

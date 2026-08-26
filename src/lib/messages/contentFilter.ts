import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

// Structural patterns — hardcoded, require a code change to modify
const STRUCTURAL_PATTERNS: RegExp[] = [
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,           // phone numbers
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,  // email addresses
  /https?:\/\/[^\s]+/i,                             // URLs
  /\b(venmo|zelle|paypal|cashapp|cash\s?app|western\s?union|wire\s?transfer|bank\s?transfer)\b/i,
  /\b(instagram|snapchat|telegram|whatsapp|discord|facebook|twitter|tiktok|kik|signal)\b/i,
  /(?:^|\s)@[a-zA-Z0-9_.]{2,}/,                    // @handles
];

// Custom terms fetched from Firestore — cached after first load, busted by admin panel
let customTermsCache: RegExp[] | null = null;

async function loadCustomTerms(): Promise<RegExp[]> {
  if (customTermsCache !== null) return customTermsCache;
  try {
    const snap = await getDoc(doc(db, "config", "contentFilter"));
    const terms: string[] = snap.data()?.customTerms ?? [];
    customTermsCache = terms
      .filter((t) => t.trim().length > 0)
      .map((t) => new RegExp(`\\b${t.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"));
  } catch {
    customTermsCache = [];
  }
  return customTermsCache;
}

export function bustContentFilterCache() {
  customTermsCache = null;
}

// Sync check against structural patterns only (used in render path)
export function isOffPlatform(text: string): boolean {
  return STRUCTURAL_PATTERNS.some((p) => p.test(text));
}

// Full async check including Firestore custom terms (used before sending)
export async function isOffPlatformAsync(text: string): Promise<boolean> {
  if (isOffPlatform(text)) return true;
  const custom = await loadCustomTerms();
  return custom.some((p) => p.test(text));
}

const PATTERNS: RegExp[] = [
  // Phone numbers (US formats)
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,
  // Email addresses
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  // URLs
  /https?:\/\/[^\s]+/i,
  // Off-platform payment services
  /\b(venmo|zelle|paypal|cashapp|cash\s?app|western\s?union|wire\s?transfer|bank\s?transfer)\b/i,
  // Social platforms used for off-platform deals
  /\b(instagram|snapchat|telegram|whatsapp|discord|facebook|twitter|tiktok|kik|signal)\b/i,
  // Social handles
  /(?:^|\s)@[a-zA-Z0-9_.]{2,}/,
];

export function isOffPlatform(text: string): boolean {
  return PATTERNS.some((p) => p.test(text));
}

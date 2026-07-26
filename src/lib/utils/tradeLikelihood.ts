const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export interface LikelihoodLabel {
  text: string;
  description: string;
  color: string;
}

export interface TradeLikelihoodInputs {
  yourTotal: number;
  theirTotal: number;
  // Personality signals — all optional; default to neutral (50) when absent
  posterBrandPrefs?: Record<string, number>;
  yourOfferedBrands?: string[];
  posterWishlisted?: boolean;
  requestedSize?: number;
  yourSize?: number;
  posterPassedOnThis?: boolean;
}

export interface TradeLikelihoodLabelContext extends TradeLikelihoodInputs {
  score: number;
  posterRecentLikes?: { brand: string; productName: string }[];
}

/**
 * Composite trade likelihood score (0–100).
 *
 * Weights:
 *   35%  Market value ratio        — are the sides financially balanced?
 *   20%  Brand affinity            — does the poster prefer the brands you're offering?
 *   20%  Wishlist signal           — did they explicitly wishlist the requested sneaker?
 *   15%  Size match                — does the requested size fit the requester?
 *   10%  Discovery signal          — penalizes if they swiped pass on this sneaker in Discover
 *
 * Any signal that lacks data defaults to 50 (neutral), so the score degrades
 * gracefully to a pure market-value read for new users with no swipe history.
 */
export function computeTradeLikelihood(inputs: TradeLikelihoodInputs): number {
  const {
    yourTotal,
    theirTotal,
    posterBrandPrefs,
    yourOfferedBrands,
    posterWishlisted,
    requestedSize,
    yourSize,
    posterPassedOnThis,
  } = inputs;

  const sum = yourTotal + theirTotal;

  // 1. Market value score (35%)
  // Equal value → 68. Offering more → >68. Offering less → <68.
  const marketScore =
    sum === 0 ? 68 : clamp(((yourTotal - theirTotal) / sum) * 120 + 68, 0, 100);

  // 2. Brand affinity score (20%)
  // Average the poster's EMA preference weight across each brand you're offering.
  let brandScore = 50;
  if (
    posterBrandPrefs &&
    Object.keys(posterBrandPrefs).length > 0 &&
    yourOfferedBrands &&
    yourOfferedBrands.length > 0
  ) {
    const weights = yourOfferedBrands.map((b) => (posterBrandPrefs[b] ?? 0.5) * 100);
    brandScore = weights.reduce((a, b) => a + b, 0) / weights.length;
  }

  // 3. Wishlist score (20%)
  // 100 = they explicitly want this; 50 = no signal either way.
  const wishlistScore = posterWishlisted === true ? 100 : 50;

  // 4. Size match score (15%)
  // Exact fit = 100. Half-size off = 70. 1 size off = 40. >1 off = 25. Unknown = 50.
  // Floor is 25 (not 0) — size mismatch is a signal, not a hard block (user may be reselling/gifting).
  let sizeScore = 50;
  if (requestedSize !== undefined && yourSize !== undefined) {
    const diff = Math.abs(requestedSize - yourSize);
    sizeScore = diff === 0 ? 100 : diff <= 0.5 ? 70 : diff <= 1 ? 40 : 25;
  }

  // 5. Discovery signal score (10%)
  // Penalize if the poster swiped pass on this exact sneaker in Discover.
  const signalScore = posterPassedOnThis === true ? 0 : 50;

  const raw =
    marketScore * 0.35 +
    brandScore * 0.2 +
    wishlistScore * 0.2 +
    sizeScore * 0.15 +
    signalScore * 0.1;

  return Math.round(clamp(raw, 0, 100));
}

/**
 * Smart, signal-aware label for the trade likelihood score.
 * Surfaces the single most actionable insight for the requester at each tier —
 * using real poster data (brand prefs, recent likes, wishlist) rather than generic copy.
 */
export function getTradeLikelihoodLabel(ctx: TradeLikelihoodLabelContext): LikelihoodLabel {
  const {
    score,
    posterBrandPrefs = {},
    yourOfferedBrands = [],
    posterWishlisted,
    posterPassedOnThis,
    posterRecentLikes = [],
    yourTotal,
    theirTotal,
  } = ctx;

  const color =
    score >= 80 ? "#33FF99"
    : score >= 70 ? "#22C55E"
    : score >= 60 ? "#84CC16"
    : score >= 50 ? "#F59E0B"
    : "#EF4444";

  const text =
    score >= 80 ? "Compelling offer"
    : score >= 70 ? "Strong offer"
    : score >= 60 ? "Fair offer"
    : score >= 50 ? "Light offer"
    : "Needs work";

  // Poster's top brand NOT already in the offer (weight > 0.6 = meaningfully preferred)
  const topMissingBrand =
    Object.entries(posterBrandPrefs)
      .filter(([brand, w]) => w > 0.6 && !yourOfferedBrands.includes(brand))
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Poster's top brand that IS in the offer
  const matchingBrand =
    yourOfferedBrands
      .map((b): [string, number] => [b, posterBrandPrefs[b] ?? 0])
      .filter(([, w]) => w > 0.6)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // A recent liked sneaker whose brand is missing from the current offer
  const recentMissingLike =
    posterRecentLikes.find((l) => !yourOfferedBrands.includes(l.brand)) ??
    posterRecentLikes[0] ??
    null;

  const cashGap = Math.round(Math.max(0, theirTotal - yourTotal));
  const trim = (name: string) => name.length > 28 ? name.slice(0, 26) + "…" : name;

  let description = "";

  if (score >= 80) {
    if (posterWishlisted) {
      description = "They wishlisted this sneaker — a great sign they'll accept";
    } else if (matchingBrand) {
      description = `Great fit — they have strong affinity for ${matchingBrand}`;
    } else if (posterRecentLikes.length > 0) {
      description = `They recently liked ${trim(posterRecentLikes[0].productName)} — your offer aligns well`;
    } else {
      description = "Strong alignment on value, fit, and taste";
    }
  } else if (score >= 70) {
    if (matchingBrand && topMissingBrand) {
      description = cashGap > 0
        ? `${matchingBrand} is a great match — add a ${topMissingBrand} or ~$${cashGap} to seal it`
        : `${matchingBrand} is a great match — add a ${topMissingBrand} to make it even stronger`;
    } else if (matchingBrand) {
      description = cashGap > 0
        ? `Well-matched on ${matchingBrand} — add ~$${cashGap} to push this even further`
        : `Well-matched — they show strong interest in ${matchingBrand}`;
    } else if (topMissingBrand) {
      description = cashGap > 0
        ? `Try including a ${topMissingBrand} or ~$${cashGap} to make this more compelling`
        : `Try including a ${topMissingBrand} to make this even more compelling`;
    } else {
      description = cashGap > 0
        ? `Add ~$${cashGap} to give this a final push`
        : "Well-matched on value with good signals";
    }
  } else if (score >= 60) {
    if (matchingBrand && topMissingBrand) {
      description = cashGap > 0
        ? `${matchingBrand} is a good match — try adding a ${topMissingBrand} or ~$${cashGap}`
        : `${matchingBrand} is a good match — try adding a ${topMissingBrand} to strengthen it`;
    } else if (topMissingBrand && recentMissingLike && recentMissingLike.brand !== topMissingBrand) {
      description = `Try a ${topMissingBrand} — they prefer it, and recently liked ${trim(recentMissingLike.productName)}`;
    } else if (topMissingBrand) {
      description = cashGap > 0
        ? `Try offering a ${topMissingBrand} or adding ~$${cashGap} to strengthen this`
        : `Try offering a ${topMissingBrand} — they show strong interest in that brand`;
    } else if (recentMissingLike) {
      description = cashGap > 0
        ? `They recently liked ${trim(recentMissingLike.productName)} — add that brand or ~$${cashGap}`
        : `They recently liked ${trim(recentMissingLike.productName)} — consider adding that brand`;
    } else {
      description = cashGap > 0
        ? `Solid value — try adding ~$${cashGap} or a preferred brand to push this higher`
        : "Solid value — a closer brand match could strengthen this";
    }
  } else if (score >= 50) {
    if (posterPassedOnThis) {
      description = "They swiped left on this in Discover — they may not want it";
    } else if (topMissingBrand && cashGap > 0) {
      description = `Add a ${topMissingBrand} or $${cashGap} to close the gap`;
    } else if (topMissingBrand) {
      description = `Try a ${topMissingBrand} — they have strong affinity for that brand`;
    } else if (recentMissingLike) {
      description = `They recently liked ${trim(recentMissingLike.productName)} — offering that brand could help`;
    } else if (cashGap > 0) {
      description = `Consider adding ~$${cashGap} to bring this closer to their value`;
    } else {
      description = "Near the bar — add cash or another item to send";
    }
  } else {
    if (posterPassedOnThis) {
      description = "They swiped left on this in Discover — strong signal they won't accept";
    } else if (topMissingBrand && cashGap > 0) {
      description = `Add a ${topMissingBrand} or ~$${cashGap} to close the value gap`;
    } else if (cashGap > 0) {
      description = `Add ~$${cashGap} or higher-value items to proceed`;
    } else {
      description = "Value gap is too large to send";
    }
  }

  return { text, description, color };
}

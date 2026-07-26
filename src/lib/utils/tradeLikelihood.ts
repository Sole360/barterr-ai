const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

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

  // 1. Market value score (30%)
  // Equal value → 68. Offering more → >68. Offering less → <68.
  const marketScore =
    sum === 0 ? 68 : clamp(((yourTotal - theirTotal) / sum) * 120 + 68, 0, 100);

  // 2. Brand affinity score (25%)
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
  // Exact fit = 100. Half-size off = 70. 1 size off = 40. >1 off = 0. Unknown = 50.
  let sizeScore = 50;
  if (requestedSize !== undefined && yourSize !== undefined) {
    const diff = Math.abs(requestedSize - yourSize);
    sizeScore = diff === 0 ? 100 : diff <= 0.5 ? 70 : diff <= 1 ? 40 : 0;
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

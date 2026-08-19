/**
 * Shared trade pricing utilities
 * Used by both frontend and backend for consistent fee calculations
 */

export const STRIPE_FEE_PCT = 0.029;
export const STRIPE_FEE_FIXED_CENTS = 30;

export const toCents = (n: number): number => Math.round(n * 100);
export const fromCents = (c: number): number => c / 100;

/**
 * Service fee scales with sneaker count:
 * 1 → $40, 2 → $50, 3 → $60, 4 → $70, 5+ → $80
 */
export const serviceFeeDollarsForCount = (count: number): number => {
  if (count <= 0) return 0;
  if (count === 1) return 40;
  if (count === 2) return 50;
  if (count === 3) return 60;
  if (count === 4) return 70;
  return 80;
};

/**
 * Service fee in cents
 */
export const serviceFeeCentsForCount = (count: number): number => {
  return toCents(serviceFeeDollarsForCount(count));
};

/**
 * Gross-up calculation to cover Stripe processing fees.
 * Returns the gross amount to charge and the fee portion.
 */
export const grossUpForStripe = (
  netCents: number,
): { grossCents: number; feeCents: number } => {
  if (netCents <= 0) {
    return { grossCents: 0, feeCents: 0 };
  }
  const gross = Math.ceil(
    (netCents + STRIPE_FEE_FIXED_CENTS) / (1 - STRIPE_FEE_PCT),
  );
  const fee = Math.max(0, gross - netCents);
  return { grossCents: gross, feeCents: fee };
};

/**
 * Calculate total charge for a trade party
 */
export const calculateTradeFees = (
  sneakerCount: number,
  cashDepositDollars: number,
): {
  serviceFeeCents: number;
  cashDepositCents: number;
  processingFeeCents: number;
  totalCents: number;
} => {
  const serviceFeeCents = serviceFeeCentsForCount(sneakerCount);
  const cashDepositCents = toCents(cashDepositDollars);
  const netCents = cashDepositCents + serviceFeeCents;
  const { grossCents, feeCents } = grossUpForStripe(netCents);

  return {
    serviceFeeCents,
    cashDepositCents,
    processingFeeCents: feeCents,
    totalCents: grossCents,
  };
};

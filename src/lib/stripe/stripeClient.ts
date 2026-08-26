import { loadStripe } from "@stripe/stripe-js";

const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

if (!key) {
  throw new Error("Missing VITE_STRIPE_PUBLISHABLE_KEY");
}

export const stripePromise = loadStripe(key);

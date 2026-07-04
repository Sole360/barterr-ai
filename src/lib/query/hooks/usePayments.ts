import { useMutation, useQuery } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/config";

interface CardSummary {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

interface SetupIntentResult {
  stripeCustomerId: string;
  clientSecret?: string;
  defaultPaymentMethodId: string;
  card: CardSummary | null;
}

interface SetDefaultPaymentMethodResult {
  defaultPaymentMethodId: string;
  card: CardSummary;
}

export function useSetupIntent(forceNew = false) {
  return useQuery({
    queryKey: ["setupIntent", forceNew],
    queryFn: async () => {
      const fn = httpsCallable<{ forceNew: boolean }, SetupIntentResult>(
        functions,
        "createSetupIntent",
      );
      const { data } = await fn({ forceNew });
      return data;
    },
  });
}

export function useSetDefaultPaymentMethod() {
  return useMutation({
    mutationFn: async (paymentMethodId: string) => {
      const fn = httpsCallable<
        { paymentMethodId: string },
        SetDefaultPaymentMethodResult
      >(functions, "setDefaultPaymentMethod");
      const { data } = await fn({ paymentMethodId });
      return data;
    },
  });
}

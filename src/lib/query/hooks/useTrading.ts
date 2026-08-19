import { useMutation } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/config";

interface AcceptTradeResult {
  success: boolean;
  receiverTotalCents: number;
}

interface RetryPaymentResult {
  success: boolean;
  status?: string;
  error?: string | null;
  message?: string;
}

export function useAcceptTrade() {
  return useMutation({
    mutationFn: async (tradeId: string) => {
      const fn = httpsCallable<{ tradeId: string }, AcceptTradeResult>(
        functions,
        "acceptTrade",
      );
      const { data } = await fn({ tradeId });
      return data;
    },
  });
}

export function useRetryPayment() {
  return useMutation({
    mutationFn: async (tradeId: string) => {
      const fn = httpsCallable<{ tradeId: string }, RetryPaymentResult>(
        functions,
        "retryPayment",
      );
      const { data } = await fn({ tradeId });
      return data;
    },
  });
}

import { useMutation } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/config";
import type { TrackingInfo } from "@/types";

export function usePurchaseLabel(tradeId: string) {
  return useMutation({
    mutationFn: async () => {
      const fn = httpsCallable<{ tradeId: string }, TrackingInfo>(
        functions,
        "purchaseShippoLabel",
      );
      const { data } = await fn({ tradeId });
      return data;
    },
  });
}

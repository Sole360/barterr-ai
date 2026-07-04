import { QueryClient, MutationCache } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Something went wrong. Please try again.";
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/contexts/auth.context";
import type { TradeReviewDraft } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { stripePromise } from "@/lib/stripe/stripeClient";

const DRAFT_STORAGE_KEY = "barterr.tradeReviewDraft.v1";

type LocationState = {
  draft?: TradeReviewDraft;
  returnTo?: string; // For receiver flow - where to go after saving PM
};

const readDraftFromSession = (): TradeReviewDraft | null => {
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TradeReviewDraft;
  } catch {
    return null;
  }
};

type SetupIntentResponse = {
  clientSecret?: string;
  defaultPaymentMethodId?: string;
};

type SetDefaultPaymentMethodResponse = {
  defaultPaymentMethodId?: string;
  card?: {
    brand?: string;
    last4?: string;
    expMonth?: number;
    expYear?: number;
  };
};

type SetupPaymentFormProps = {
  onSaved: () => void;
};

const SetupPaymentForm = ({ onSaved }: SetupPaymentFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();

  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    if (!stripe || !elements || submitting) return;

    setSubmitting(true);

    try {
      const result = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required",
      });

      let paymentMethodId = "";

      if (result.error) {
        // Handle "already succeeded" case - extract PM from error if available
        if (
          result.error.code === "setup_intent_unexpected_state" &&
          result.error.setup_intent?.payment_method
        ) {
          const pm = result.error.setup_intent.payment_method;
          paymentMethodId = typeof pm === "string" ? pm : (pm?.id ?? "");
        }

        if (!paymentMethodId) {
          toast({
            title: "Payment method not saved",
            description: result.error.message ?? "Please try again.",
            variant: "destructive",
          });
          return;
        }
      } else {
        const pm = result.setupIntent?.payment_method;
        paymentMethodId = typeof pm === "string" ? pm : (pm?.id ?? "");
      }

      if (!paymentMethodId) {
        toast({
          title: "Payment method not saved",
          description: "Stripe did not return a payment method id.",
          variant: "destructive",
        });
        return;
      }

      const functions = getFunctions(undefined, "us-central1");
      const setDefaultPm = httpsCallable(functions, "setDefaultPaymentMethod");

      const res = await setDefaultPm({ paymentMethodId });
      const data = res.data as SetDefaultPaymentMethodResponse;

      if (!data?.defaultPaymentMethodId) {
        toast({
          title: "Payment method not saved",
          description: "Could not confirm your saved payment method.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Payment method saved",
        description: "Returning to your trade…",
      });

      onSaved();
    } catch (e) {
      console.error("Save payment method error:", e);
      toast({
        title: "Payment method not saved",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <PaymentElement />
      <div className="mt-4">
        <Button
          className="w-full bg-[#3366FF]"
          type="button"
          disabled={!stripe || !elements || submitting}
          onClick={handleSave}
        >
          {submitting ? "Saving…" : "Save payment method"}
        </Button>
      </div>
    </div>
  );
};

export const TradePaymentMethodPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { currentUser } = useAuth();

  const uid = currentUser?.uid ?? "";

  const state = (location.state as LocationState | null) ?? null;
  const draft = state?.draft ?? readDraftFromSession();
  const returnTo = state?.returnTo; // For receiver flow

  const [loading, setLoading] = useState(true);
  const [clientSecret, setClientSecret] = useState<string>("");

  // Use location.key to force fresh SetupIntent on each navigation to this page
  const locationKey = location.key;

  useEffect(() => {
    // For sender flow (creating trade): require draft
    // For receiver flow (accepting trade): require returnTo
    if (!draft && !returnTo) {
      navigate("/trades/new", { replace: true });
      return;
    }

    if (!uid) {
      toast({
        title: "Sign in required",
        description: "Please sign in to add a payment method.",
        variant: "destructive",
      });
      navigate(returnTo || "/trades/new", { replace: true });
      return;
    }

    let alive = true;

    const run = async () => {
      // Clear any stale clientSecret before fetching new one
      setClientSecret("");
      setLoading(true);

      try {
        const functions = getFunctions(undefined, "us-central1");
        const fn = httpsCallable(functions, "createSetupIntent");
        // Always force new SetupIntent since user explicitly navigated here to add/change card
        const res = await fn({ forceNew: true });

        const data = res.data as SetupIntentResponse;
        const secret = data.clientSecret ?? "";

        if (!alive) return;

        // Always show the form - user may want to change their payment method
        if (!secret) {
          toast({
            title: "Couldn't start payment setup",
            description: "Missing Stripe client secret.",
            variant: "destructive",
          });
          return;
        }

        setClientSecret(secret);
      } catch (e) {
        console.error("createSetupIntent error:", e);
        toast({
          title: "Couldn't start payment setup",
          description: "Please try again.",
          variant: "destructive",
        });
      } finally {
        if (alive) setLoading(false);
      }
    };

    run();

    return () => {
      alive = false;
    };
  }, [draft, returnTo, navigate, toast, uid, locationKey]);

  const elementsOptions = useMemo(() => {
    if (!clientSecret) return null;
    return { clientSecret, appearance: { theme: "stripe" as const } };
  }, [clientSecret]);

  if (!draft && !returnTo) return null;

  return (
    <div className="min-h-[100dvh] bg-white">
      <div className="mx-auto w-full max-w-xl px-4 pb-10 pt-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <div className="flex-1 text-center text-sm font-semibold">
            Payment Method
          </div>

          <div className="w-16" />
        </div>

        <div className="mt-4">
          <div className="text-sm font-semibold">Add a payment method</div>
          <div className="mt-1 text-xs text-muted-foreground">
            This will be used to charge your deposit after both users confirm.
          </div>

          {loading ? (
            <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-muted-foreground">
              Loading payment form…
            </div>
          ) : elementsOptions ? (
            <Elements key={clientSecret} stripe={stripePromise} options={elementsOptions}>
              <SetupPaymentForm
                onSaved={() => {
                  if (returnTo) {
                    // Receiver flow - go back to trade detail
                    navigate(returnTo, { replace: true });
                  } else {
                    // Sender flow - go back to trade review
                    navigate("/trades/new/review", {
                      replace: true,
                      state: { draft },
                    });
                  }
                }}
              />
            </Elements>
          ) : (
            <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-muted-foreground">
              Unable to load payment form.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

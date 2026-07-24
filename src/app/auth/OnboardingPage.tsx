import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/lib/contexts/auth.context";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const onboardingSchema = z.object({
  shoeSize: z.string().min(1, "Shoe size is required"),
});

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

export const OnboardingPage = () => {
  const [loading, setLoading] = useState(false);
  const { updateUserProfile } = useAuth();
  const navigate = useNavigate();

  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      shoeSize: "10",
    },
  });

  async function onSubmit(values: OnboardingFormValues) {
    try {
      setLoading(true);

      const shoeSize = parseFloat(values.shoeSize);

      if (isNaN(shoeSize) || shoeSize < 4 || shoeSize > 18) {
        form.setError("shoeSize", {
          message: "Shoe size must be between 4 and 18",
        });
        setLoading(false);
        return;
      }

      await updateUserProfile({
        shoeSize,
        onboardingFinished: true,
      });

      navigate("/discover?onboarding=true");
    } catch (error) {
      console.error("Onboarding error:", error);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-r from-[#33FF99] to-[#3366FF] flex items-center justify-center p-4">
      <div className="bg-card rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Welcome to Barterr! 🔥
          </h1>
          <p className="text-muted-foreground">Let's get you set up</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="shoeSize"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>What's your shoe size? (US)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.5"
                      placeholder="10"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-red-500" />
                  <p className="text-sm text-muted-foreground mt-1">
                    Required — we use your size to automatically add sneakers to
                    your wishlist when you discover them
                  </p>
                </FormItem>
              )}
            />

            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-sm text-blue-800">
                💡 <strong>Coming soon:</strong> You'll be able to add sneakers
                to your collection, browse trades, and more!
              </p>
            </div>

            <Button
              type="submit"
              className="w-full bg-[#3366FF] hover:bg-[#3366FF]/90"
              disabled={loading}
            >
              {loading ? "Setting up..." : "Get Started"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
};

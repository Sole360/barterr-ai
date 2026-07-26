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

const ALL_BRANDS = ["Nike", "Jordan", "Adidas", "New Balance", "Asics", "Puma", "Reebok", "Vans"];
const BRAND_ROWS = [
  ["Nike", "Adidas", "Jordan"],
  ["New Balance", "Asics", "Puma"],
  ["Reebok", "Vans"],
];

// Hex dimensions for flat-top hexagon layout
const HEX_W = 92;
const HEX_H = 80;
const COL_STEP = HEX_W + 10; // 102
const ROW_STEP = Math.round(HEX_H * 0.75); // 60
const ROW_OFFSET = Math.round(COL_STEP / 2); // 51 — shifts alternate rows to create honeycomb

const HEX_CLIP = "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";

interface BrandHexProps {
  brand: string;
  selected: boolean;
  onToggle: () => void;
}

const BrandHex = ({ brand, selected, onToggle }: BrandHexProps) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={selected}
    style={{ width: HEX_W, height: HEX_H, flexShrink: 0, position: "relative" }}
    className="focus:outline-none"
  >
    {/* Outer hex — gradient when selected, subtle border when not */}
    <span
      className="absolute inset-0"
      style={{
        clipPath: HEX_CLIP,
        background: selected
          ? "linear-gradient(135deg, #33FF99, #3366FF)"
          : "rgba(120,120,140,0.22)",
      }}
    />
    {/* Inner hex — card fill for unselected state (creates border illusion) */}
    {!selected && (
      <span
        className="absolute bg-card"
        style={{ clipPath: HEX_CLIP, top: 2.5, left: 2.5, right: 2.5, bottom: 2.5 }}
      />
    )}
    <span
      className={`absolute inset-0 flex items-center justify-center text-center font-bold leading-tight px-3 ${
        selected ? "text-white" : "text-foreground"
      }`}
      style={{ fontSize: brand.length > 7 ? 9 : 11 }}
    >
      {brand}
    </span>
  </button>
);

export const OnboardingPage = () => {
  const [step, setStep] = useState<1 | 2>(1);
  const [pendingShoeSize, setPendingShoeSize] = useState<number>(10);
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const { updateUserProfile } = useAuth();
  const navigate = useNavigate();

  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { shoeSize: "10" },
  });

  // Step 1 submit — validate size, advance to brand step
  async function onShoeSizeSubmit(values: OnboardingFormValues) {
    const shoeSize = parseFloat(values.shoeSize);
    if (isNaN(shoeSize) || shoeSize < 4 || shoeSize > 18) {
      form.setError("shoeSize", { message: "Shoe size must be between 4 and 18" });
      return;
    }
    setPendingShoeSize(shoeSize);
    setStep(2);
  }

  const toggleBrand = (brand: string) => {
    setSelectedBrands((prev) => {
      const next = new Set(prev);
      next.has(brand) ? next.delete(brand) : next.add(brand);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedBrands((prev) =>
      prev.size === ALL_BRANDS.length ? new Set() : new Set(ALL_BRANDS)
    );
  };

  // Step 2 submit — save everything and navigate
  async function finishOnboarding(skip: boolean) {
    try {
      setLoading(true);
      const updates: Record<string, unknown> = {
        shoeSize: pendingShoeSize,
        onboardingFinished: true,
      };
      if (!skip && selectedBrands.size > 0) {
        const brands: Record<string, number> = {};
        selectedBrands.forEach((b) => { brands[b] = 0.65; });
        updates.preferences = { brands };
      }
      await updateUserProfile(updates);
      navigate("/discover?onboarding=true");
    } catch (error) {
      console.error("Onboarding error:", error);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-r from-[#33FF99] to-[#3366FF] flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-md overflow-hidden">

        {/* Step indicator */}
        <div className="flex gap-1.5 px-8 pt-6">
          {[1, 2].map((s) => (
            <div
              key={s}
              className="h-1 flex-1 rounded-full transition-colors duration-300"
              style={{
                background: s <= step ? "linear-gradient(90deg, #33FF99, #3366FF)" : "rgba(120,120,140,0.2)",
              }}
            />
          ))}
        </div>

        {/* ── Step 1: Shoe size ── */}
        {step === 1 && (
          <div className="px-8 pt-6 pb-8">
            <h1 className="text-2xl font-bold text-foreground mb-1">Welcome to Barterr</h1>
            <p className="text-sm text-muted-foreground mb-7">Let's get your profile set up</p>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onShoeSizeSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="shoeSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>What's your shoe size? (US)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.5" placeholder="10" {...field} />
                      </FormControl>
                      <FormMessage className="text-red-500" />
                      <p className="text-xs text-muted-foreground mt-1">
                        Required — used to match you with the right sizes in trades and wishlists
                      </p>
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full text-white font-semibold"
                  style={{ background: "linear-gradient(90deg, #33FF99, #3366FF)" }}
                >
                  Continue
                </Button>
              </form>
            </Form>
          </div>
        )}

        {/* ── Step 2: Brand selection ── */}
        {step === 2 && (
          <div className="px-8 pt-6 pb-8">
            <div className="flex items-start justify-between mb-1">
              <h1 className="text-2xl font-bold text-foreground">Brand Loyalties?</h1>
              <button
                type="button"
                onClick={() => finishOnboarding(true)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground underline underline-offset-2 mt-1.5 shrink-0 ml-4"
              >
                Skip
              </button>
            </div>
            <div className="flex items-center gap-3 mb-6">
              <p className="text-sm text-muted-foreground">Select all that apply</p>
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs font-semibold underline underline-offset-2"
                style={{ color: "#3366FF" }}
              >
                {selectedBrands.size === ALL_BRANDS.length ? "Deselect all" : "Select all"}
              </button>
            </div>

            {/* Honeycomb hex grid */}
            <div className="flex flex-col items-start mb-8" style={{ gap: 0 }}>
              {BRAND_ROWS.map((row, ri) => (
                <div
                  key={ri}
                  className="flex"
                  style={{
                    gap: 10,
                    marginTop: ri === 0 ? 0 : -(HEX_H - ROW_STEP),
                    marginLeft: ri === 0 ? 0 : ROW_OFFSET,
                  }}
                >
                  {row.map((brand) => (
                    <BrandHex
                      key={brand}
                      brand={brand}
                      selected={selectedBrands.has(brand)}
                      onToggle={() => toggleBrand(brand)}
                    />
                  ))}
                </div>
              ))}
            </div>

            <Button
              type="button"
              onClick={() => finishOnboarding(false)}
              disabled={loading}
              className="w-full text-white font-semibold"
              style={{ background: "linear-gradient(90deg, #33FF99, #3366FF)" }}
            >
              {loading ? "Setting up…" : "Get Started"}
            </Button>
          </div>
        )}

      </div>
    </div>
  );
};

import { useCallback, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics/gtag";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/contexts/auth.context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlacesAutocomplete, type ParsedAddress } from "@/lib/hooks/usePlacesAutocomplete";

const ALL_BRANDS = ["Nike", "Jordan", "Adidas", "New Balance", "Asics", "Puma", "Reebok", "Vans"];
const BRAND_ROWS = [
  ["Nike", "Adidas", "Jordan"],
  ["New Balance", "Asics", "Puma"],
  ["Reebok", "Vans"],
];

const MENS_SIZES = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16];
const WOMENS_SIZES = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12];


const HEX_W = 92;
const HEX_H = 80;
const COL_STEP = HEX_W + 10;
const ROW_STEP = Math.round(HEX_H * 0.75);
const ROW_OFFSET = Math.round(COL_STEP / 2);
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
    <span
      className="absolute inset-0"
      style={{
        clipPath: HEX_CLIP,
        background: selected
          ? "linear-gradient(135deg, #33FF99, #3366FF)"
          : "rgba(120,120,140,0.22)",
      }}
    />
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
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sizeGender, setSizeGender] = useState<"mens" | "womens">("mens");
  const [selectedSize, setSelectedSize] = useState<number | null>(null);
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [zip, setZip] = useState("");
  const [sizeError, setSizeError] = useState("");
  const [loading, setLoading] = useState(false);
  const addressDropdownRef = useRef<HTMLDivElement>(null);
  const { updateUserProfile } = useAuth();
  const navigate = useNavigate();

  const onAddressSelect = useCallback((parsed: ParsedAddress) => {
    setStreet(parsed.street);
    setCity(parsed.city);
    setAddrState(parsed.state);
    setZip(parsed.zip);
  }, []);

  const { suggestions, fetchSuggestions, selectSuggestion, clearSuggestions } =
    usePlacesAutocomplete(onAddressSelect);

  const sizes = sizeGender === "mens" ? MENS_SIZES : WOMENS_SIZES;

  const handleShoeSizeNext = () => {
    if (!selectedSize) {
      setSizeError("Please select a shoe size to continue");
      return;
    }
    setSizeError("");
    setStep(2);
  };

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

  const finishOnboarding = async (skipAddress: boolean) => {
    if (!selectedSize) return;
    try {
      setLoading(true);
      const updates: Record<string, unknown> = {
        shoeSize: selectedSize,
        shoeSizeGender: sizeGender,
        onboardingFinished: true,
      };
      if (selectedBrands.size > 0) {
        const brands: Record<string, number> = {};
        selectedBrands.forEach((b) => { brands[b] = 0.65; });
        updates.preferences = { brands };
      }
      if (!skipAddress && street && city && addrState && zip) {
        updates.address = { street, city, state: addrState, zip, country: "US" };
      }
      await updateUserProfile(updates);
      trackEvent("tutorial_complete");
      navigate("/discover?onboarding=true");
    } catch (error) {
      console.error("Onboarding error:", error);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-r from-[#33FF99] to-[#3366FF] flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-md overflow-hidden">

        {/* Step indicator */}
        <div className="flex gap-1.5 px-8 pt-6">
          {[1, 2, 3].map((s) => (
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
            <p className="text-sm text-muted-foreground mb-6">Let's get your profile set up</p>

            <p className="text-sm font-semibold text-foreground mb-3">What's your shoe size? (US)</p>

            {/* Gender tabs */}
            <div className="flex gap-2 mb-4">
              {(["mens", "womens"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => { setSizeGender(g); setSelectedSize(null); setSizeError(""); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all border ${
                    sizeGender === g
                      ? "border-[#3366FF] text-[#3366FF] bg-[#3366FF]/10"
                      : "border-border text-muted-foreground hover:border-[#3366FF]/40"
                  }`}
                >
                  {g === "mens" ? "Men's" : "Women's"}
                </button>
              ))}
            </div>

            {/* Size buttons — horizontally scrollable */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
              {sizes.map((size) => {
                const active = selectedSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => { setSelectedSize(size); setSizeError(""); }}
                    className={`w-14 h-10 rounded-xl text-sm font-semibold shrink-0 transition-all border ${
                      active
                        ? "border-transparent text-white"
                        : "border-border text-foreground hover:border-[#3366FF]/50"
                    }`}
                    style={active ? { background: "linear-gradient(135deg, #33FF99, #3366FF)" } : {}}
                  >
                    {size}
                  </button>
                );
              })}
            </div>

            {sizeError && (
              <p className="text-xs text-red-500 mt-2">{sizeError}</p>
            )}

            <p className="text-xs text-muted-foreground mt-3 mb-6">
              Used to match you with the right sizes in trades and wishlists
            </p>

            <Button
              type="button"
              onClick={handleShoeSizeNext}
              className="w-full text-white font-semibold"
              style={{ background: "linear-gradient(90deg, #33FF99, #3366FF)" }}
            >
              Continue
            </Button>
          </div>
        )}

        {/* ── Step 2: Brand selection ── */}
        {step === 2 && (
          <div className="px-8 pt-6 pb-8">
            <div className="flex items-start justify-between mb-1">
              <h1 className="text-2xl font-bold text-foreground">Brand Loyalties?</h1>
              <button
                type="button"
                onClick={() => setStep(3)}
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
              onClick={() => setStep(3)}
              className="w-full text-white font-semibold"
              style={{ background: "linear-gradient(90deg, #33FF99, #3366FF)" }}
            >
              Continue
            </Button>
          </div>
        )}

        {/* ── Step 3: Shipping address ── */}
        {step === 3 && (
          <div className="px-8 pt-6 pb-8">
            <div className="flex items-start justify-between mb-1">
              <h1 className="text-2xl font-bold text-foreground">Shipping Address</h1>
              <button
                type="button"
                onClick={() => finishOnboarding(true)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground underline underline-offset-2 mt-1.5 shrink-0 ml-4"
              >
                Skip
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Required to send and receive trades. You can add this later in Account Settings.
            </p>

            <div className="space-y-3">
              <div className="relative" ref={addressDropdownRef}>
                <Input
                  value={street}
                  onChange={(e) => {
                    setStreet(e.target.value);
                    fetchSuggestions(e.target.value);
                  }}
                  onBlur={() => setTimeout(clearSuggestions, 150)}
                  placeholder="Start typing your address…"
                  autoComplete="off"
                />
                {suggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={() => selectSuggestion(s)}
                        className="w-full px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors border-b border-border last:border-0"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
                <Input
                  placeholder="State"
                  value={addrState}
                  onChange={(e) => setAddrState(e.target.value)}
                  maxLength={2}
                />
              </div>
              <Input
                placeholder="ZIP code"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                maxLength={10}
                className="max-w-[160px]"
              />
            </div>

            <Button
              type="button"
              onClick={() => finishOnboarding(false)}
              disabled={loading}
              className="w-full text-white font-semibold mt-6"
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

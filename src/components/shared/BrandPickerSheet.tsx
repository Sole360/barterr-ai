import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import { Check, X } from "lucide-react";
import { searchClient, ALGOLIA_INDEX } from "@/lib/algolia/config";

export const KNOWN_BRANDS = ["Nike", "Adidas", "Jordan", "New Balance"];

interface BrandOption {
  brand: string;
  count: number;
}

interface BrandPickerSheetProps {
  open: boolean;
  onClose: () => void;
  /** "OTHER_ALL" = show all non-featured brands; any other string = specific brand */
  activeBrand: string;
  onSelect: (brand: string) => void;
}

export const BrandPickerSheet = ({
  open,
  onClose,
  activeBrand,
  onSelect,
}: BrandPickerSheetProps) => {
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const fetchFacets = async () => {
      setLoading(true);
      try {
        const { results } = await searchClient.search([
          {
            indexName: ALGOLIA_INDEX,
            params: {
              query: "",
              facets: ["brand"],
              hitsPerPage: 0,
              attributesToRetrieve: [],
            },
          },
        ]);

        if (cancelled) return;

        const facets = (results[0] as { facets?: Record<string, Record<string, number>> })
          .facets?.brand ?? {};

        const otherBrands = Object.entries(facets)
          .filter(([b]) => !KNOWN_BRANDS.includes(b))
          .sort((a, b) => b[1] - a[1])
          .map(([brand, count]) => ({ brand, count }));

        setBrands(otherBrands);
      } catch {
        // silently fail — user can close and retry
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchFacets();
    return () => { cancelled = true; };
  }, [open]);

  const isAllOther = activeBrand === "OTHER_ALL";

  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl max-h-[70vh] flex flex-col focus:outline-none">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 shrink-0 border-b border-border">
            <h2 className="text-base font-semibold text-foreground">Other brands</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-accent transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Brand list */}
          <div className="overflow-y-auto flex-1 py-2">
            {loading ? (
              <div className="px-5 py-6 space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between animate-pulse">
                    <div className="h-4 bg-muted rounded-full w-28" />
                    <div className="h-4 bg-muted rounded-full w-8" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                {/* All other brands catch-all */}
                <button
                  onClick={() => { onSelect("OTHER_ALL"); onClose(); }}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-accent transition-colors"
                >
                  <span className="text-sm font-medium text-foreground">All other brands</span>
                  {isAllOther && <Check className="w-4 h-4 text-[#3366FF]" />}
                </button>

                {brands.length > 0 && (
                  <div className="mx-5 border-t border-border" />
                )}

                {brands.map(({ brand, count }) => {
                  const isActive = activeBrand === brand;
                  return (
                    <button
                      key={brand}
                      onClick={() => { onSelect(brand); onClose(); }}
                      className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-accent transition-colors"
                    >
                      <span className={`text-sm font-medium ${isActive ? "text-[#3366FF]" : "text-foreground"}`}>
                        {brand}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{count}</span>
                        {isActive && <Check className="w-4 h-4 text-[#3366FF]" />}
                      </div>
                    </button>
                  );
                })}

                {brands.length === 0 && !loading && (
                  <p className="px-5 py-4 text-sm text-muted-foreground">
                    No other brands in the catalog yet.
                  </p>
                )}
              </>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
};

import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { TradeReviewDraft } from "@/types/index";

type TradeReviewLocationState = {
  draft?: TradeReviewDraft;
};

export const TradeReviewPage = () => {
  // -----------------------------
  // Routing state (Compose -> Review)
  // -----------------------------
  const navigate = useNavigate();
  const location = useLocation();

  const state = (location.state as TradeReviewLocationState | null) ?? null;
  const draft = state?.draft;

  // If user refreshes Review, navigate state is lost. MVP behavior: send them back.
  useEffect(() => {
    if (!draft) navigate("/trades/new", { replace: true });
  }, [draft, navigate]);

  if (!draft) return null;

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-4">
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
            Review Trade
          </div>

          <div className="w-16" />
        </div>

        {/* Summary */}
        <div className="mt-3 rounded-xl border bg-[#3366FF] p-4 text-white shadow-sm">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Trade Summary</div>
            </div>

            <div className="flex shrink-0 items-start gap-6 text-right">
              <div>
                <div className="text-xs text-white/80">Net</div>
                <div className="text-lg font-bold leading-none">
                  {draft.netTotal >= 0 ? "+" : "-"}$
                  {Math.abs(draft.netTotal).toFixed(0)}
                </div>
              </div>

              <div>
                <div className="text-xs text-white/80">Likelihood</div>
                <div className="text-lg font-bold leading-none">
                  {draft.likelihood}%
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-white/10 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Cash that you added</div>
                <div className="text-sm font-semibold">${draft.addCash}</div>
              </div>
              <input
                type="range"
                min={0}
                max={500}
                step={10}
                value={draft.addCash}
                disabled
                className="mt-2 w-full accent-white"
              />
            </div>

            <div className="rounded-lg bg-white/10 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">
                  Cash that you're asking for
                </div>
                <div className="text-sm font-semibold">${draft.askCash}</div>
              </div>
              <input
                type="range"
                min={0}
                max={500}
                step={10}
                value={draft.askCash}
                disabled
                className="mt-2 w-full accent-white"
              />
            </div>
          </div>
        </div>

        {/* Two-sided review (mobile-first) */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Your side */}
          <section className="rounded-2xl border border-gray-200 p-4">
            <div className="text-sm font-semibold">You’re offering</div>

            <div className="mt-3 space-y-3">
              {draft.yourItems.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center gap-4 rounded-xl border border-gray-200 p-3"
                >
                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg bg-gray-100 p-2">
                    {i.imageUrl ? (
                      <img
                        src={i.imageUrl}
                        alt={i.name}
                        className="h-full w-full object-contain"
                      />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-base font-semibold">
                      {i.name}
                    </div>
                    <div className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                      {i.brand ? `${i.brand} • ` : ""}
                      {i.size}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-semibold">{i.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Their side */}
          <section className="rounded-2xl border border-gray-200 p-4">
            <div className="text-sm font-semibold">You’re requesting</div>

            <div className="mt-3 space-y-3">
              {draft.theirItems.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center gap-4 rounded-xl border border-gray-200 p-3"
                >
                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg bg-gray-100 p-2">
                    {i.imageUrl ? (
                      <img
                        src={i.imageUrl}
                        alt={i.title}
                        className="h-full w-full object-contain"
                      />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-base font-semibold">
                      {i.title}
                    </div>
                    <div className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                      Size {i.size} • {i.condition}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-semibold">${i.tradeValue}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Sticky action */}
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <div className="border-t border-gray-200 bg-white/90 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
            <div className="mx-auto w-full max-w-7xl">
              <Button
                className="w-full border-[#3366FF]/40 text-[#3366FF]"
                variant="outline"
                disabled
              >
                Send Trade (next)
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

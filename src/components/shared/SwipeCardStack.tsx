import { useState, useEffect, useCallback } from "react";
import type { SearchResult } from "@/types";
import { SwipeCard, SwipeActionButtons } from "./SwipeCard";

interface SwipeCardStackProps {
  initialCards: SearchResult[];
  swipedSet: Set<string>;
  onSwipe: (sneaker: SearchResult, result: "like" | "pass" | "want") => void;
  onFetchMore: () => Promise<SearchResult[]>;
  onEmpty: () => void;
}

export const SwipeCardStack = ({
  initialCards,
  swipedSet,
  onSwipe,
  onFetchMore,
  onEmpty,
}: SwipeCardStackProps) => {
  const [stack, setStack] = useState<SearchResult[]>(initialCards);
  const [fetching, setFetching] = useState(false);

  // Pre-fetch when running low
  useEffect(() => {
    if (stack.length < 3 && !fetching) {
      setFetching(true);
      onFetchMore()
        .then((more) => {
          const fresh = more.filter((s) => !swipedSet.has(s.styleId));
          setStack((prev) => {
            const existingIds = new Set(prev.map((s) => s.styleId));
            return [...prev, ...fresh.filter((s) => !existingIds.has(s.styleId))];
          });
        })
        .finally(() => setFetching(false));
    }
  }, [stack.length, fetching, onFetchMore, swipedSet]);

  const handleSwipe = useCallback(
    (result: "like" | "pass" | "want") => {
      const top = stack[0];
      if (!top) return;
      onSwipe(top, result);
      setStack((prev) => prev.slice(1));
    },
    [stack, onSwipe]
  );

  useEffect(() => {
    if (stack.length === 0 && !fetching) {
      onEmpty();
    }
  }, [stack.length, fetching, onEmpty]);

  const visible = stack.slice(0, 3);

  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col items-center w-full">
      {/* Card area */}
      <div className="relative w-full max-w-sm" style={{ height: 480 }}>
        {[...visible].reverse().map((sneaker, reversedIdx) => {
          const stackIndex = visible.length - 1 - reversedIdx;
          return (
            <SwipeCard
              key={sneaker.styleId}
              sneaker={sneaker}
              onSwipe={handleSwipe}
              isTop={stackIndex === 0}
              stackIndex={stackIndex}
            />
          );
        })}
      </div>

      {/* Action buttons */}
      <SwipeActionButtons onSwipe={handleSwipe} />
    </div>
  );
};

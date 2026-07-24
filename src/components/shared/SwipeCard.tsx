import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  PanInfo,
} from "framer-motion";
import type { SearchResult } from "@/types";

interface SwipeCardProps {
  sneaker: SearchResult;
  onSwipe: (result: "like" | "pass" | "want") => void;
  isTop: boolean;
  stackIndex: number; // 0 = top, 1 = second, 2 = third
}

const X_THRESHOLD = 100;
const Y_THRESHOLD = -150;

export const SwipeCard = ({ sneaker, onSwipe, isTop, stackIndex }: SwipeCardProps) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const isDragging = useRef(false);

  const rotate = useTransform(x, [-200, 200], [-30, 30]);

  const likeOpacity = useTransform(x, [0, X_THRESHOLD], [0, 1]);
  const passOpacity = useTransform(x, [-X_THRESHOLD, 0], [1, 0]);
  const wantOpacity = useTransform(y, [Y_THRESHOLD, 0], [1, 0]);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const { offset } = info;
    if (offset.y < Y_THRESHOLD) {
      onSwipe("want");
    } else if (offset.x > X_THRESHOLD) {
      onSwipe("like");
    } else if (offset.x < -X_THRESHOLD) {
      onSwipe("pass");
    } else {
      // Snap back
      x.set(0);
      y.set(0);
    }
  };

  const scale = 1 - stackIndex * 0.04;
  const translateY = stackIndex * 8;

  return (
    <motion.div
      className="absolute inset-0"
      style={{
        scale,
        y: isTop ? y : translateY,
        x: isTop ? x : 0,
        rotate: isTop ? rotate : 0,
        zIndex: 10 - stackIndex,
        touchAction: "none",
      }}
      drag={isTop ? true : false}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.9}
      onDragStart={() => { isDragging.current = true; }}
      onDragEnd={handleDragEnd}
      whileDrag={{ cursor: "grabbing" }}
    >
      <div className="relative w-full h-full rounded-3xl overflow-hidden shadow-xl bg-white select-none">
        {/* Sneaker image */}
        <img
          src={sneaker.imageUrl}
          alt={sneaker.name}
          className="w-full h-full object-cover"
          draggable={false}
        />

        {/* Gradient overlay for text */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

        {/* Bottom info */}
        <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
          <span className="inline-block text-xs font-semibold uppercase tracking-wider bg-white/20 backdrop-blur-sm rounded-full px-3 py-1 mb-2">
            {sneaker.brand}
          </span>
          <h2 className="text-lg font-bold leading-tight line-clamp-2">{sneaker.name}</h2>
          {sneaker.avg_price && (
            <p className="text-sm text-white/80 mt-1">~${sneaker.avg_price.toLocaleString()}</p>
          )}
        </div>

        {/* Swipe overlays — only visible on top card */}
        {isTop && (
          <>
            <motion.div
              className="absolute top-8 left-8 border-4 border-green-400 rounded-xl px-4 py-2 rotate-[-20deg]"
              style={{ opacity: likeOpacity }}
            >
              <span className="text-green-400 text-2xl font-black tracking-wider">LIKE</span>
            </motion.div>

            <motion.div
              className="absolute top-8 right-8 border-4 border-red-400 rounded-xl px-4 py-2 rotate-[20deg]"
              style={{ opacity: passOpacity }}
            >
              <span className="text-red-400 text-2xl font-black tracking-wider">PASS</span>
            </motion.div>

            <motion.div
              className="absolute top-8 left-1/2 -translate-x-1/2 border-4 border-blue-400 rounded-xl px-4 py-2"
              style={{ opacity: wantOpacity }}
            >
              <span className="text-blue-400 text-2xl font-black tracking-wider">WANT</span>
            </motion.div>
          </>
        )}
      </div>
    </motion.div>
  );
};

// Fallback tap buttons for desktop / accessibility
export const SwipeActionButtons = ({
  onSwipe,
}: {
  onSwipe: (result: "like" | "pass" | "want") => void;
}) => (
  <div className="flex items-center justify-center gap-6 mt-6">
    <button
      onClick={() => onSwipe("pass")}
      className="w-14 h-14 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center text-2xl hover:scale-110 transition-transform"
      aria-label="Pass"
    >
      ✕
    </button>
    <button
      onClick={() => onSwipe("want")}
      className="w-16 h-16 rounded-full bg-blue-500 shadow-lg flex items-center justify-center text-2xl text-white hover:scale-110 transition-transform"
      aria-label="Want"
    >
      ★
    </button>
    <button
      onClick={() => onSwipe("like")}
      className="w-14 h-14 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center text-2xl hover:scale-110 transition-transform"
      aria-label="Like"
    >
      ♥
    </button>
  </div>
);

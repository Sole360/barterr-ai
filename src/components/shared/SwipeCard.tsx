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
  stackIndex: number;
}

const X_THRESHOLD = 100;
const Y_THRESHOLD = -150;

export const SwipeCard = ({ sneaker, onSwipe, isTop, stackIndex }: SwipeCardProps) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const isDragging = useRef(false);

  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const likeOpacity = useTransform(x, [20, X_THRESHOLD], [0, 1]);
  const passOpacity = useTransform(x, [-X_THRESHOLD, -20], [1, 0]);
  const wantOpacity = useTransform(y, [Y_THRESHOLD, -40], [1, 0]);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y < Y_THRESHOLD) {
      onSwipe("want");
    } else if (info.offset.x > X_THRESHOLD) {
      onSwipe("like");
    } else if (info.offset.x < -X_THRESHOLD) {
      onSwipe("pass");
    } else {
      x.set(0);
      y.set(0);
    }
  };

  const scale = 1 - stackIndex * 0.035;
  const translateY = stackIndex * 10;

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
      drag={isTop}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.85}
      onDragStart={() => { isDragging.current = true; }}
      onDragEnd={handleDragEnd}
      whileDrag={{ cursor: "grabbing" }}
    >
      <div className="relative w-full h-full rounded-[28px] overflow-hidden select-none bg-white"
        style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)" }}
      >
        {/* Image area — warm gradient background so white-bg product shots look intentional */}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(160deg, #F5F3EE 0%, #EAE8FF 55%, #DFF8F0 100%)" }}
        />

        <img
          src={sneaker.imageUrl}
          alt={sneaker.name}
          className="absolute inset-0 w-full object-contain select-none"
          style={{ height: "72%", top: 0, padding: "24px 20px 0" }}
          draggable={false}
        />

        {/* Bottom gradient fade */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: "46%",
            background: "linear-gradient(to top, rgba(10,10,14,0.96) 60%, rgba(10,10,14,0) 100%)",
          }}
        />

        {/* Bottom info */}
        <div className="absolute bottom-0 left-0 right-0 p-5 pb-6">
          {/* Gradient brand badge */}
          <span
            className="inline-block text-xs font-bold uppercase tracking-widest rounded-full px-3 py-1 mb-3 text-white"
            style={{ background: "linear-gradient(90deg, #33FF99, #3366FF)" }}
          >
            {sneaker.brand}
          </span>

          <h2 className="text-white text-xl font-bold leading-snug line-clamp-2 mb-1">
            {sneaker.name}
          </h2>

          {sneaker.avg_price && sneaker.avg_price > 0 ? (
            <p className="text-white/60 text-sm font-medium">
              ~${sneaker.avg_price.toLocaleString()} avg
            </p>
          ) : null}
        </div>

        {/* Swipe overlays */}
        {isTop && (
          <>
            <motion.div
              className="absolute top-7 left-6 rounded-2xl px-4 py-2"
              style={{
                opacity: likeOpacity,
                border: "3px solid #33FF99",
                rotate: "-15deg",
                background: "rgba(51,255,153,0.08)",
              }}
            >
              <span className="font-black text-xl tracking-widest text-[#33FF99]">LIKE</span>
            </motion.div>

            <motion.div
              className="absolute top-7 right-6 rounded-2xl px-4 py-2"
              style={{
                opacity: passOpacity,
                border: "3px solid #FF4D4D",
                rotate: "15deg",
                background: "rgba(255,77,77,0.08)",
              }}
            >
              <span className="font-black text-xl tracking-widest text-[#FF4D4D]">PASS</span>
            </motion.div>

            <motion.div
              className="absolute top-7 left-1/2 -translate-x-1/2 rounded-2xl px-4 py-2"
              style={{
                opacity: wantOpacity,
                border: "3px solid #3366FF",
                background: "rgba(51,102,255,0.08)",
              }}
            >
              <span className="font-black text-xl tracking-widest text-[#3366FF]">WANT</span>
            </motion.div>
          </>
        )}
      </div>
    </motion.div>
  );
};

export const SwipeActionButtons = ({
  onSwipe,
}: {
  onSwipe: (result: "like" | "pass" | "want") => void;
}) => (
  <div className="flex items-center justify-center gap-5 pt-5 pb-2">
    {/* Pass */}
    <button
      onClick={() => onSwipe("pass")}
      className="flex flex-col items-center gap-1.5 group"
      aria-label="Pass"
    >
      <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center text-[#FF4D4D] transition-transform group-hover:scale-110 group-active:scale-95"
        style={{ boxShadow: "0 4px 16px rgba(255,77,77,0.18), 0 1px 4px rgba(0,0,0,0.08)" }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </div>
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Pass</span>
    </button>

    {/* Want — center, larger, gradient */}
    <button
      onClick={() => onSwipe("want")}
      className="flex flex-col items-center gap-1.5 group"
      aria-label="Want"
    >
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center text-white transition-transform group-hover:scale-110 group-active:scale-95"
        style={{
          background: "linear-gradient(135deg, #33FF99, #3366FF)",
          boxShadow: "0 6px 24px rgba(51,102,255,0.35), 0 2px 6px rgba(0,0,0,0.1)",
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
        </svg>
      </div>
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Want</span>
      <span className="text-[9px] text-muted-foreground/60 -mt-0.5">Wishlist</span>
    </button>

    {/* Like */}
    <button
      onClick={() => onSwipe("like")}
      className="flex flex-col items-center gap-1.5 group"
      aria-label="Like"
    >
      <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center text-[#33C97B] transition-transform group-hover:scale-110 group-active:scale-95"
        style={{ boxShadow: "0 4px 16px rgba(51,201,123,0.18), 0 1px 4px rgba(0,0,0,0.08)" }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </div>
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Like</span>
    </button>
  </div>
);

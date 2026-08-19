import { ReactNode } from "react";

interface HorizontalScrollRowProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  loading?: boolean;
  itemCount?: number;
}

function SkeletonCard() {
  return (
    <div className="shrink-0 w-36 animate-pulse">
      <div className="aspect-square rounded-2xl bg-muted" />
      <div className="mt-2 space-y-1.5 px-0.5">
        <div className="h-2 bg-muted rounded-full w-1/3" />
        <div className="h-2.5 bg-muted rounded-full w-full" />
        <div className="h-2.5 bg-muted rounded-full w-3/4" />
      </div>
    </div>
  );
}

export function HorizontalScrollRow({
  title,
  subtitle,
  children,
  loading = false,
  itemCount = 5,
}: HorizontalScrollRowProps) {
  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>

      <div className="relative -mx-4 px-4">
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          {loading
            ? Array.from({ length: itemCount }).map((_, i) => (
                <SkeletonCard key={i} />
              ))
            : children}
        </div>
      </div>
    </section>
  );
}

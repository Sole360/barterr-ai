import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type CollectionItem = {
  id: string;
  name: string;
  size: string;
  value: string;
  imageUrl?: string;
  status?: "approved" | "pending";
};

type Props = {
  items: CollectionItem[];
  onAddToCollection?: () => void;
};

export function CollectionGrid({ items, onAddToCollection }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      <AddToCollectionTile onClick={onAddToCollection} />

      {items.map((item) => (
        <SneakerCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function AddToCollectionTile({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border bg-card p-4",
        "min-h-[220px] flex flex-col items-center justify-center gap-2",
        "hover:bg-accent/30 transition-colors"
      )}
    >
      <div className="h-10 w-10 rounded-full bg-gradient-to-r from-accent to-primary grid place-items-center text-primary-foreground">
        <Plus className="h-5 w-5" />
      </div>
      <div className="text-sm font-semibold text-foreground">Add</div>
      <div className="text-xs text-muted-foreground">to My Collection</div>
    </button>
  );
}

function SneakerCard({ item }: { item: CollectionItem }) {
  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <div className="relative aspect-square bg-muted">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : null}

        {item.status === "pending" ? (
          <div className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-1 text-[11px] font-medium text-foreground border">
            Pending Review
          </div>
        ) : null}
      </div>

      <div className="p-3">
        <div className="text-sm font-semibold text-foreground line-clamp-2">
          {item.name}
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{item.size}</span>
          <span className="font-medium text-foreground">{item.value}</span>
        </div>
      </div>
    </div>
  );
}

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CollectionItem } from "@/types";

type Props = {
  items: CollectionItem[];
  onAddToCollection?: () => void;
  onSelectItem?: (item: CollectionItem) => void;
};

export const CollectionGrid = ({
  items,
  onAddToCollection,
  onSelectItem,
}: Props) => {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
      <AddToCollectionTile onClick={onAddToCollection} />
      {items.map((item) => (
        <SneakerCard
          key={item.id}
          item={item}
          onClick={() => onSelectItem?.(item)}
        />
      ))}
    </div>
  );
};

const AddToCollectionTile = ({ onClick }: { onClick?: () => void }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative rounded-2xl p-4 text-white",
        "min-h-[220px] flex flex-col items-center justify-center gap-2",
        "bg-gradient-to-br from-barterr-green-1 to-barterr-blue-2",
        "hover:opacity-95 transition"
      )}
    >
      <div className="h-12 w-12 rounded-full bg-white/20 grid place-items-center">
        <Plus className="h-6 w-6 text-white" />
      </div>
      <div className="text-sm font-semibold">Add</div>
      <div className="text-xs opacity-90">to My Collection</div>
    </button>
  );
};

const SneakerCard = ({
  item,
  onClick,
}: {
  item: CollectionItem;
  onClick?: () => void;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-2xl border bg-white overflow-hidden hover:shadow-sm transition"
    >
      <div className="relative aspect-[4/3] bg-white">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-full w-full object-contain p-3"
            referrerPolicy="no-referrer"
          />
        ) : null}

        {item.status === "rejected" ? (
          <div className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[11px] font-medium border">
            Rejected
          </div>
        ) : item.status === "pending" ? (
          <div className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[11px] font-medium border">
            Pending Review
          </div>
        ) : null}
      </div>

      <div className="p-3">
        <div className="text-sm font-semibold line-clamp-2">{item.name}</div>
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{item.size}</span>
          <span className="font-medium text-foreground">{item.value}</span>
        </div>
      </div>
    </button>
  );
};

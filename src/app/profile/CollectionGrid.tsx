import { Plus } from "lucide-react";
import type { CollectionItem } from "@/types";

type Props = {
  items: CollectionItem[];
  onAddToCollection?: () => void;
  onSelectItem?: (item: CollectionItem) => void;
};

export const CollectionGrid = ({ items, onAddToCollection, onSelectItem }: Props) => (
  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
    <AddToCollectionTile onClick={onAddToCollection} />
    {items.map((item) => (
      <SneakerCard key={item.id} item={item} onClick={() => onSelectItem?.(item)} />
    ))}
  </div>
);

const AddToCollectionTile = ({ onClick }: { onClick?: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="relative rounded-2xl text-white min-h-[200px] flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#33FF99] to-[#3366FF] hover:opacity-90 transition-opacity shadow-[0_2px_16px_rgba(51,102,255,0.3)]"
  >
    <div className="h-11 w-11 rounded-full bg-white/20 flex items-center justify-center">
      <Plus className="h-5 w-5 text-white" />
    </div>
    <div className="text-sm font-semibold">Add Sneaker</div>
    <div className="text-xs opacity-80">to My Collection</div>
  </button>
);

const SneakerCard = ({ item, onClick }: { item: CollectionItem; onClick?: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="group text-left rounded-2xl bg-white dark:bg-card overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.07)] hover:shadow-[0_8px_28px_rgba(0,0,0,0.12)] hover:-translate-y-0.5 transition-all duration-200"
  >
    <div className="relative aspect-square bg-gray-50 dark:bg-muted/60 overflow-hidden">
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt={item.name}
          className="absolute inset-0 w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-300"
          referrerPolicy="no-referrer"
        />
      )}
      {item.status === "pending" && (
        <div className="absolute left-2 top-2 bg-white/90 dark:bg-card/90 backdrop-blur-sm px-2 py-0.5 rounded-full text-[10px] font-semibold border border-border text-muted-foreground">
          Pending Review
        </div>
      )}
      {item.status === "rejected" && (
        <div className="absolute left-2 top-2 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400">
          Rejected
        </div>
      )}
    </div>
    <div className="px-3.5 pt-3 pb-3.5">
      <div className="text-sm font-semibold text-foreground line-clamp-2 leading-snug mb-1.5">
        {item.name}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{item.size}</span>
        <span className="font-semibold text-foreground">{item.value}</span>
      </div>
    </div>
  </button>
);

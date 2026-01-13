import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProfileTabKey } from "@/types";

type Props = {
  value: ProfileTabKey;
  onValueChange: (v: ProfileTabKey) => void;
};

export const ProfileTabs = ({ value, onValueChange }: Props) => {
  return (
    <Tabs
      value={value}
      onValueChange={(v: string) => onValueChange(v as ProfileTabKey)}
    >
      <TabsList className="w-full justify-start overflow-x-auto whitespace-nowrap md:grid md:grid-cols-4 md:justify-center">
        <TabsTrigger value="collection" className="shrink-0">
          My Collection
        </TabsTrigger>
        <TabsTrigger value="wishlist" className="shrink-0">
          Wishlist
        </TabsTrigger>
        <TabsTrigger value="fashion" className="shrink-0">
          Fashion Photos
        </TabsTrigger>
        <TabsTrigger value="trades" className="shrink-0">
          Recent Trades
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
};

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ProfileTabKey = "collection" | "fashion" | "trades";

type Props = {
  value: ProfileTabKey;
  onValueChange: (v: ProfileTabKey) => void;
};

export function ProfileTabs({ value, onValueChange }: Props) {
  return (
    <Tabs
      value={value}
      onValueChange={(v: string) => onValueChange(v as ProfileTabKey)}
    >
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="collection">My Collection</TabsTrigger>
        <TabsTrigger value="fashion">Fashion Photos</TabsTrigger>
        <TabsTrigger value="trades">Recent Trades</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

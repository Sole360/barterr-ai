import { useState } from "react";
import { Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface AddSneakerDialogProps {
  open: boolean;
  onClose: () => void;
}

interface SearchResult {
  id: string;
  name: string;
  brand: string;
  imageUrl: string;
  styleId: string;
}

export function AddSneakerDialog({ open, onClose }: AddSneakerDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"search" | "details">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [selectedSneaker, setSelectedSneaker] = useState<SearchResult | null>(
    null
  );
  const [loading, setLoading] = useState(false);

  // Form state
  const [size, setSize] = useState("");
  const [condition, setCondition] = useState(10);
  const [hasBox, setHasBox] = useState(true);
  const [hasInsoles, setHasInsoles] = useState(true);
  const [hasLaces, setHasLaces] = useState(true);
  const [flaws, setFlaws] = useState("");

  // Common sneaker sizes
  const sneakerSizes = [
    "4",
    "4.5",
    "5",
    "5.5",
    "6",
    "6.5",
    "7",
    "7.5",
    "8",
    "8.5",
    "9",
    "9.5",
    "10",
    "10.5",
    "11",
    "11.5",
    "12",
    "12.5",
    "13",
    "13.5",
    "14",
    "14.5",
    "15",
    "16",
    "17",
    "18",
  ];

  // Dummy search results
  const dummySearchResults: SearchResult[] = [
    {
      id: "1",
      name: "Air Jordan 1 Retro High OG Chicago",
      brand: "Nike",
      imageUrl:
        "https://images.unsplash.com/photo-1584735175097-719d848f8449?w=400&h=300&fit=crop",
      styleId: "555088-101",
    },
    {
      id: "2",
      name: "Nike Dunk Low Panda",
      brand: "Nike",
      imageUrl:
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=300&fit=crop",
      styleId: "DD1391-100",
    },
    {
      id: "3",
      name: "Yeezy Boost 350 V2",
      brand: "Adidas",
      imageUrl:
        "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=400&h=300&fit=crop",
      styleId: "FZ5000",
    },
  ];

  const handleSearch = () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setShowResults(true);

    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      toast({
        title: "Search complete",
        description: `Found ${dummySearchResults.length} sneakers`,
      });
    }, 500);
  };

  const handleSelectSneaker = (sneaker: SearchResult) => {
    setSelectedSneaker(sneaker);
    setStep("details");
  };

  const handleSubmit = async () => {
    if (!selectedSneaker || !size) return;

    const listingData = {
      sneaker: selectedSneaker,
      size: parseFloat(size),
      condition,
      details: {
        box: hasBox,
        insoles: hasInsoles,
        laces: hasLaces,
        flaws,
      },
    };

    console.log("Listing data:", listingData);

    // Simulate saving
    toast({
      title: "Adding to collection...",
      description: "Please wait",
    });

    // Simulate API call
    setTimeout(() => {
      toast({
        title: "Success!",
        description: `${selectedSneaker.name} added to your collection`,
      });
      handleClose();
    }, 1000);
  };

  const handleClose = () => {
    setStep("search");
    setSearchQuery("");
    setShowResults(false);
    setSelectedSneaker(null);
    setSize("");
    setCondition(10);
    setHasBox(true);
    setHasInsoles(true);
    setHasLaces(true);
    setFlaws("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl h-[100vh] sm:h-[90vh] w-full sm:max-w-2xl overflow-y-auto bg-white p-0 sm:rounded-lg">
        <DialogHeader className="mb-6">
          <DialogTitle className="text-2xl font-bold text-gray-900">
            {step === "search"
              ? "Add Sneaker to Collection"
              : "Listing Details"}
          </DialogTitle>
        </DialogHeader>
        {step === "search" ? (
          // Search Step
          <div className="space-y-6">
            <p className="text-gray-600">
              Search for your sneaker to add it to your collection
            </p>

            {/* Search Bar */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search by name, brand, or style ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSearch();
                    }
                  }}
                  className="pl-10 h-12"
                  autoFocus
                />
              </div>
              <Button
                onClick={handleSearch}
                className="bg-[#3366FF] hover:bg-[#3366FF]/90 h-12 px-6"
                disabled={!searchQuery.trim() || loading}
              >
                {loading ? "Searching..." : "Search"}
              </Button>
            </div>

            {/* Search Results */}
            {showResults && (
              <div className="space-y-4">
                <p className="text-sm font-medium text-gray-700">
                  {dummySearchResults.length} results found
                </p>
                <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto">
                  {dummySearchResults.map((sneaker) => (
                    <button
                      key={sneaker.id}
                      onClick={() => handleSelectSneaker(sneaker)}
                      className="flex items-center gap-4 p-4 border-2 border-gray-200 rounded-lg hover:border-[#3366FF] hover:bg-blue-50 transition-colors text-left"
                    >
                      <img
                        src={sneaker.imageUrl}
                        alt={sneaker.name}
                        className="w-24 h-24 object-cover rounded-md flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#3366FF] mb-1">
                          {sneaker.brand}
                        </p>
                        <h3 className="font-semibold text-gray-900 mb-1">
                          {sneaker.name}
                        </h3>
                        <p className="text-sm text-gray-500">
                          Style: {sneaker.styleId}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!showResults && (
              <div className="text-center py-12 text-gray-400">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Search for a sneaker to get started</p>
              </div>
            )}
          </div>
        ) : (
          // Details Step
          <div className="space-y-6">
            {/* Selected Sneaker Preview */}
            {selectedSneaker && (
              <div className="flex items-center gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <img
                  src={selectedSneaker.imageUrl}
                  alt={selectedSneaker.name}
                  className="w-16 h-16 object-cover rounded"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#3366FF]">
                    {selectedSneaker.brand}
                  </p>
                  <h3 className="font-semibold text-gray-900 truncate">
                    {selectedSneaker.name}
                  </h3>
                </div>
                <button
                  onClick={() => setStep("search")}
                  className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Size Dropdown */}
            <div>
              <Label
                htmlFor="size"
                className="text-sm font-medium text-gray-700 mb-2 block"
              >
                Size (US) *
              </Label>
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {sneakerSizes.map((sizeOption) => (
                    <SelectItem key={sizeOption} value={sizeOption}>
                      US {sizeOption}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Condition Slider */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-medium text-gray-700">
                  Condition
                </Label>
                <span className="text-sm font-semibold text-[#3366FF]">
                  {condition}/10 {condition === 10 && "✨ Deadstock"}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={condition}
                onChange={(e) => setCondition(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#3366FF]"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-2">
                <span>Poor</span>
                <span>Fair</span>
                <span>Good</span>
                <span>Excellent</span>
                <span>New</span>
              </div>
            </div>

            {/* Checkboxes */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-gray-700">
                What's Included?
              </Label>
              <div className="space-y-3 pl-1">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasBox}
                    onChange={(e) => setHasBox(e.target.checked)}
                    className="w-5 h-5 text-[#3366FF] rounded border-gray-300 focus:ring-[#3366FF] cursor-pointer"
                  />
                  <span className="ml-3 text-sm text-gray-700">
                    Original Box
                  </span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasInsoles}
                    onChange={(e) => setHasInsoles(e.target.checked)}
                    className="w-5 h-5 text-[#3366FF] rounded border-gray-300 focus:ring-[#3366FF] cursor-pointer"
                  />
                  <span className="ml-3 text-sm text-gray-700">Insoles</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasLaces}
                    onChange={(e) => setHasLaces(e.target.checked)}
                    className="w-5 h-5 text-[#3366FF] rounded border-gray-300 focus:ring-[#3366FF] cursor-pointer"
                  />
                  <span className="ml-3 text-sm text-gray-700">
                    Original Laces
                  </span>
                </label>
              </div>
            </div>

            {/* Flaws Textarea */}
            {condition < 10 && (
              <div>
                <Label
                  htmlFor="flaws"
                  className="text-sm font-medium text-gray-700"
                >
                  Flaws or Notes (Optional)
                </Label>
                <Textarea
                  id="flaws"
                  placeholder="Describe any wear, flaws, or important details..."
                  value={flaws}
                  onChange={(e) => setFlaws(e.target.value)}
                  className="mt-2"
                  rows={4}
                />
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setStep("search")}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!size}
                className="flex-1 bg-[#3366FF] hover:bg-[#3366FF]/90"
              >
                Add to Collection
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from "react";
import { Search, X, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { useAuth } from "@/lib/contexts/AuthContext";
import {
  createOrUpdatePost,
  createListing,
} from "@/lib/firebase/posts.service";
import { queueImageUpload } from "@/lib/firebase/imageQueue.service";
import { searchSneakers, SearchResult } from "@/lib/api/kicksdb.service";

interface AddSneakerDialogProps {
  open: boolean;
  onClose: () => void;
}

// Extended interface for selected sneakers with form data
interface SelectedSneaker extends SearchResult {
  size: string;
  condition: number;
  tradeValue: string;
  hasBox: boolean;
  hasInsoles: boolean;
  hasLaces: boolean;
  flaws: string;
}

export function AddSneakerDialog({ open, onClose }: AddSneakerDialogProps) {
  const { toast } = useToast();
  const { currentUser, userProfile } = useAuth();

  const [step, setStep] = useState<"search" | "details">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selectedSneaker, setSelectedSneaker] = useState<SearchResult | null>(
    null
  );
  const [selectedSneakers, setSelectedSneakers] = useState<SelectedSneaker[]>(
    []
  );
  const [saving, setSaving] = useState(false);

  // Form state
  const [size, setSize] = useState("");
  const [condition, setCondition] = useState(10);
  const [tradeValue, setTradeValue] = useState("");
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

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchSneakers(searchQuery);
        setSearchResults(results);
        setShowResults(true);
      } catch (error) {
        console.error("Search error:", error);
        toast({
          title: "Search failed",
          description: "Unable to search sneakers. Please try again.",
          variant: "destructive",
        });
      } finally {
        setSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, toast]);

  const handleSelectSneaker = (sneaker: SearchResult) => {
    setSelectedSneaker(sneaker);
    setStep("details");
  };

  const handleAddToList = () => {
    if (!selectedSneaker || !size || !tradeValue) return;

    const sneakerToAdd: SelectedSneaker = {
      ...selectedSneaker,
      size,
      condition,
      tradeValue,
      hasBox,
      hasInsoles,
      hasLaces,
      flaws,
    };

    setSelectedSneakers([...selectedSneakers, sneakerToAdd]);

    toast({
      title: "Added to list!",
      description: `${selectedSneaker.name} - Size ${size}`,
    });

    // Reset form but keep last size and condition as defaults
    setSelectedSneaker(null);
    setTradeValue("");
    setFlaws("");
    setStep("search");
    setSearchQuery("");
    setSearchResults([]);
    setShowResults(false);
  };

  const handleRemoveFromList = (index: number) => {
    setSelectedSneakers(selectedSneakers.filter((_, i) => i !== index));
  };

  const handleSaveAll = async () => {
    if (selectedSneakers.length === 0) return;
    if (!userProfile) {
      toast({
        title: "Error",
        description: "You must be logged in to add sneakers",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    let successCount = 0;
    let failCount = 0;

    try {
      // Show initial toast
      toast({
        title: `Adding ${selectedSneakers.length} sneaker${
          selectedSneakers.length > 1 ? "s" : ""
        }...`,
        description: "This may take a moment",
      });

      // Process each sneaker
      for (const sneaker of selectedSneakers) {
        try {
          // Create or get post (with temporary StockX/GOAT image)
          const postId = await createOrUpdatePost({
            styleId: sneaker.styleId,
            title: sneaker.name,
            brand: sneaker.brand,
            productImageUrl: sneaker.imageUrl, // Temporary URL
            userId: currentUser!.uid,
          });

          // Create listing
          await createListing({
            postId,
            userId: currentUser!.uid,
            userName: `${userProfile.firstName} ${userProfile.lastName.charAt(
              0
            )}.`,
            userRating: 5.0,
            size: parseFloat(sneaker.size),
            condition: sneaker.condition === 10 ? "new" : "used",
            conditionGrade: sneaker.condition,
            tradeValue: parseFloat(sneaker.tradeValue),
            location: userProfile.location ?? "Location not set",
            responseTime: "Usually responds within 24 hours",
            photos: [],
          });

          // Queue background image upload
          await queueImageUpload(
            postId,
            sneaker.styleId,
            sneaker.imageUrl,
            sneaker.source
          );

          successCount++;
        } catch (error) {
          console.error("Error adding sneaker:", error);
          console.error("Error details:", JSON.stringify(error, null, 2));
          failCount++;
        }
      }

      // Show final result
      if (failCount === 0) {
        toast({
          title: "Success! 🎉",
          description: `${successCount} sneaker${
            successCount > 1 ? "s" : ""
          } added to your collection`,
        });
      } else {
        toast({
          title: "Partial success",
          description: `${successCount} added, ${failCount} failed`,
          variant: "destructive",
        });
      }

      handleClose();
    } catch (error) {
      console.error("Error saving sneakers:", error);
      toast({
        title: "Error",
        description: "Failed to save sneakers. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setStep("search");
    setSearchQuery("");
    setSearchResults([]);
    setShowResults(false);
    setSelectedSneaker(null);
    setSelectedSneakers([]);
    setSize("");
    setTradeValue("");
    setCondition(10);
    setHasBox(true);
    setHasInsoles(true);
    setHasLaces(true);
    setFlaws("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-2xl h-[90vh] p-0 bg-white overflow-hidden flex flex-col [&>button]:hidden">
        <DialogTitle className="sr-only">
          {step === "search" ? "Add Sneakers" : "Sneaker Details"}
        </DialogTitle>
        {/* Sticky Header */}
        <div className="bg-white border-b px-4 sm:px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                {step === "search" ? "Add Sneakers" : "Sneaker Details"}
              </h2>
              {selectedSneakers.length > 0 && (
                <p className="text-sm text-gray-600 mt-1">
                  {selectedSneakers.length} sneaker
                  {selectedSneakers.length > 1 ? "s" : ""} ready to save
                </p>
              )}
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
          {step === "search" ? (
            // Search Step
            <div className="space-y-6">
              {/* Search Bar */}
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  Search for sneakers to add to your collection
                </p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
                  <Input
                    type="text"
                    placeholder="Search by name, brand, or style ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-12"
                    autoFocus
                  />
                </div>
              </div>

              {/* Search Results */}
              {searching && (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#3366FF]"></div>
                  <p className="text-sm text-gray-500 mt-2">Searching...</p>
                </div>
              )}

              {showResults && !searching && (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-gray-700">
                    {searchResults.length} results found
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    {searchResults.map((sneaker) => (
                      <button
                        key={sneaker.id}
                        onClick={() => handleSelectSneaker(sneaker)}
                        className="flex items-center gap-4 p-4 border-2 border-gray-200 rounded-lg hover:border-[#3366FF] hover:bg-blue-50 transition-colors text-left"
                      >
                        <div className="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 bg-white rounded-md overflow-hidden">
                          <img
                            src={sneaker.imageUrl}
                            alt={sneaker.name}
                            className="w-full h-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[#3366FF] mb-1">
                            {sneaker.brand}
                          </p>
                          <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">
                            {sneaker.name}
                          </h3>
                          <p className="text-sm text-gray-500">
                            {sneaker.styleId}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!showResults && !searching && (
                <div className="text-center py-12 text-gray-400">
                  <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Search for a sneaker to get started</p>
                </div>
              )}

              {/* Selected Sneakers List */}
              {selectedSneakers.length > 0 && (
                <div className="mt-8 border-t pt-6">
                  <h3 className="font-semibold text-gray-900 mb-4">
                    Selected Sneakers ({selectedSneakers.length})
                  </h3>
                  <div className="space-y-3">
                    {selectedSneakers.map((sneaker, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="w-12 h-12 flex-shrink-0 bg-white rounded overflow-hidden">
                          <img
                            src={sneaker.imageUrl}
                            alt={sneaker.name}
                            className="w-full h-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-gray-900 truncate">
                            {sneaker.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            Size {sneaker.size} • ${sneaker.tradeValue}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemoveFromList(index)}
                          className="text-red-500 hover:text-red-700 p-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            // Details Step
            <div className="space-y-6">
              {/* Selected Sneaker Preview */}
              {selectedSneaker && (
                <div className="flex items-center gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="w-16 h-16 flex-shrink-0 bg-white rounded overflow-hidden">
                    <img
                      src={selectedSneaker.imageUrl}
                      alt={selectedSneaker.name}
                      className="w-full h-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
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

              {/* Trade Value */}
              <div>
                <Label
                  htmlFor="tradeValue"
                  className="text-sm font-medium text-gray-700 mb-2 block"
                >
                  Trade Value (USD) *
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                    $
                  </span>
                  <Input
                    id="tradeValue"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="180"
                    value={tradeValue}
                    onChange={(e) => setTradeValue(e.target.value)}
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Estimated market value for trade purposes
                </p>
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
            </div>
          )}
        </div>
        {/* Fixed Bottom Actions */}
        <div className="sticky bottom-0 bg-white border-t p-4 sm:px-6">
          {step === "search" ? (
            <Button
              onClick={handleSaveAll}
              disabled={selectedSneakers.length === 0 || saving}
              className="w-full bg-[#3366FF] hover:bg-[#3366FF]/90 h-12"
            >
              {saving
                ? "Saving..."
                : selectedSneakers.length > 0
                ? `Save ${selectedSneakers.length} Sneaker${
                    selectedSneakers.length > 1 ? "s" : ""
                  }`
                : "Select sneakers to continue"}
            </Button>
          ) : (
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setStep("search");
                  setSelectedSneaker(null);
                }}
                className="flex-1 h-12"
              >
                Back
              </Button>
              <Button
                onClick={handleAddToList}
                disabled={!size || !tradeValue}
                className="flex-1 bg-[#3366FF] hover:bg-[#3366FF]/90 h-12"
              >
                Add to List
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

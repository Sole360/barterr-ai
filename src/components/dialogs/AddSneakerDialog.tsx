import { useState, useEffect, useRef } from "react";
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
import { useAuth } from "@/lib/contexts/auth.context";
import {
  createOrUpdatePost,
  createListing,
} from "@/lib/firebase/posts.service";
import { queueImageUpload } from "@/lib/firebase/imageQueue.service";
import { searchSneakers } from "@/lib/api/kicksdb.service";
import type { SearchResult, SelectedSneaker } from "@/types";
import { CategoryPhotoUpload } from "@/components/shared/CategoryPhotoUpload";
import {
  updateDoc,
  doc,
  arrayUnion,
  Timestamp,
  collection,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { deleteFolder } from "@/lib/firebase/storageCleanup";

interface AddSneakerDialogProps {
  open: boolean;
  onClose: () => void;
}

export const AddSneakerDialog = ({ open, onClose }: AddSneakerDialogProps) => {
  const { toast } = useToast();
  const { currentUser, userProfile } = useAuth();
  const [draftListingId, setDraftListingId] = useState<string>("");

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
  const skipDraftCleanupRef = useRef(false);

  // Photo upload state
  const [uploadedPhotos, setUploadedPhotos] = useState<{
    appearance?: string;
    boxLabel?: string;
    insoles?: string;
    boxFrontal?: string;
    insoleStitching?: string;
    dateCode?: string;
  }>({});

  const photoCategories = [
    { key: "appearance", label: "Appearance" },
    { key: "boxLabel", label: "Box Label" },
    { key: "insoles", label: "Insoles/Sockliner" },
    { key: "boxFrontal", label: "Box Front" },
    { key: "insoleStitching", label: "Insole Stitching" },
    { key: "dateCode", label: "Date Code" },
  ];

  const handlePhotoUploadComplete = (category: string, downloadURL: string) => {
    setUploadedPhotos((prev) => ({
      ...prev,
      [category]: downloadURL,
    }));
  };

  const handlePhotoUploadError = (error: Error) => {
    toast({
      title: "Upload failed",
      description: error.message,
      variant: "destructive",
    });
  };

  const allPhotosUploaded = photoCategories.every(
    (cat) => uploadedPhotos[cat.key as keyof typeof uploadedPhotos]
  );

  const uploadedCount = Object.keys(uploadedPhotos).length;

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
    const id = doc(collection(db, "listings")).id;

    setDraftListingId(id);
    setSelectedSneaker(sneaker);
    setStep("details");
  };

  const handleAddToList = () => {
    if (!selectedSneaker || !size || !tradeValue) return;

    // Check photos for used condition
    if (condition < 10 && !allPhotosUploaded) {
      toast({
        title: "Photos required",
        description: `Please upload all 6 required photos (${uploadedCount}/6)`,
        variant: "destructive",
      });
      return;
    }

    const sneakerToAdd: SelectedSneaker = {
      ...selectedSneaker,
      listingId: draftListingId,
      size,
      condition,
      tradeValue,
      hasBox,
      hasInsoles,
      hasLaces,
      flaws,
      photos: condition < 10 ? uploadedPhotos : undefined,
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
    setUploadedPhotos({});
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
            apiID: sneaker.id,
            source: sneaker.source,
          });

          // Create listing with photos if used
          await createListing({
            listingId: sneaker.listingId,
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
            photos: sneaker.photos,
            approvalStatus: sneaker.condition === 10 ? "approved" : "pending",
            productName: sneaker.name,
            productImageUrl: sneaker.imageUrl,
            brand: sneaker.brand,
            styleId: sneaker.styleId,
            apiID: sneaker.id,
            source: sneaker.source,
          });

          // Add to owners array in post
          const postRef = doc(db, "posts", postId);
          await updateDoc(postRef, {
            owners: arrayUnion({
              userId: currentUser!.uid,
              displayName: `${userProfile.firstName} ${userProfile.lastName}`,
              email: userProfile.email,
              userPhoto: userProfile.photoURL ?? "",
              size: parseFloat(sneaker.size),
              condition: sneaker.condition,
            }),
            updatedAt: Timestamp.now(),
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
      const hasUsedSneakers = selectedSneakers.some((s) => s.condition < 10);
      if (failCount === 0) {
        toast({
          title: "Success! 🎉",
          description: hasUsedSneakers
            ? `${successCount} sneaker${
                successCount > 1 ? "s" : ""
              } submitted for review`
            : `${successCount} sneaker${
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

      skipDraftCleanupRef.current = true;
      await handleClose();
      skipDraftCleanupRef.current = false;
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

  const handleClose = async () => {
    try {
      // Only attempt cleanup if we have a draft id + a user
      if (!skipDraftCleanupRef.current && draftListingId && currentUser?.uid) {
        // delete draft folder: sneaker_uploads/{uid}/{draftListingId}/...
        await deleteFolder(
          `sneaker_uploads/${currentUser.uid}/${draftListingId}`
        );
      }
    } catch (err) {
      console.error("Failed to cleanup draft listing photos:", err);
    } finally {
      setDraftListingId("");

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
      setUploadedPhotos({});
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={() => {
        void handleClose();
      }}
    >
      <DialogContent className="w-full max-w-2xl h-[90vh] p-0 bg-card overflow-hidden flex flex-col [&>button]:hidden">
        <DialogTitle className="sr-only">
          {step === "search" ? "Add Sneakers" : "Sneaker Details"}
        </DialogTitle>
        {/* Sticky Header */}
        <div className="bg-card border-b px-4 sm:px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                {step === "search" ? "Add Sneakers" : "Sneaker Details"}
              </h2>
              {selectedSneakers.length > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedSneakers.length} sneaker
                  {selectedSneakers.length > 1 ? "s" : ""} ready to save
                </p>
              )}
            </div>
            <button
              onClick={() => {
                void handleClose();
              }}
              className="text-muted-foreground hover:text-foreground transition-colors"
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
                <p className="text-sm text-muted-foreground">
                  Search for sneakers to add to your collection
                </p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5 pointer-events-none" />
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
                  <p className="text-sm text-muted-foreground mt-2">Searching...</p>
                </div>
              )}

              {showResults && !searching && (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-foreground">
                    {searchResults.length} results found
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    {searchResults.map((sneaker) => (
                      <button
                        key={sneaker.id}
                        onClick={() => handleSelectSneaker(sneaker)}
                        className="flex items-center gap-4 p-4 border-2 border-border rounded-lg hover:border-[#3366FF] hover:bg-[#3366FF]/5 transition-colors text-left"
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
                          <h3 className="font-semibold text-foreground mb-1 line-clamp-2">
                            {sneaker.name}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {sneaker.styleId}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!showResults && !searching && (
                <div className="text-center py-12 text-muted-foreground">
                  <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Search for a sneaker to get started</p>
                </div>
              )}

              {/* Selected Sneakers List */}
              {selectedSneakers.length > 0 && (
                <div className="mt-8 border-t pt-6">
                  <h3 className="font-semibold text-foreground mb-4">
                    Selected Sneakers ({selectedSneakers.length})
                  </h3>
                  <div className="space-y-3">
                    {selectedSneakers.map((sneaker, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
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
                          <p className="font-medium text-sm text-foreground truncate">
                            {sneaker.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Size {sneaker.size} • ${sneaker.tradeValue}
                            {sneaker.condition < 10 && " • Pending Review"}
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
                <div className="flex items-center gap-4 p-4 bg-[#3366FF]/5 border border-[#3366FF]/20 rounded-lg">
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
                    <h3 className="font-semibold text-foreground truncate">
                      {selectedSneaker.name}
                    </h3>
                  </div>
                  <button
                    onClick={() => setStep("search")}
                    className="text-muted-foreground hover:text-foreground flex-shrink-0"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              )}

              {/* Size Dropdown */}
              <div>
                <Label
                  htmlFor="size"
                  className="text-sm font-medium text-foreground mb-2 block"
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
                  className="text-sm font-medium text-foreground mb-2 block"
                >
                  Trade Value (USD) *
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
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
                <p className="text-xs text-muted-foreground mt-1">
                  Estimated market value for trade purposes
                </p>
              </div>

              {/* Condition Slider */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-sm font-medium text-foreground">
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
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-[#3366FF]"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>Poor</span>
                  <span>Fair</span>
                  <span>Good</span>
                  <span>Excellent</span>
                  <span>New</span>
                </div>
              </div>

              {/* Photo Upload for Used Sneakers */}
              {condition < 10 && draftListingId && (
                <div className="border-t pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-foreground">
                      Required Photos *
                    </h3>
                    <span
                      className={`text-sm font-medium ${
                        allPhotosUploaded ? "text-green-600" : "text-muted-foreground"
                      }`}
                    >
                      {uploadedCount}/6 uploaded
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {photoCategories.map((category) => (
                      <CategoryPhotoUpload
                        key={category.key}
                        category={category.key}
                        categoryLabel={category.label}
                        userId={currentUser?.uid ?? ""}
                        listingId={draftListingId}
                        existingPhotoUrl={
                          uploadedPhotos[
                            category.key as keyof typeof uploadedPhotos
                          ]
                        }
                        onUploadComplete={handlePhotoUploadComplete}
                        onUploadError={handlePhotoUploadError}
                      />
                    ))}
                  </div>

                  {!allPhotosUploaded && (
                    <p className="text-xs text-orange-600 text-center">
                      ⚠️ All 6 photos required • Listing will need admin
                      approval
                    </p>
                  )}
                </div>
              )}

              {/* Checkboxes */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-foreground">
                  What's Included?
                </Label>
                <div className="space-y-3 pl-1">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasBox}
                      onChange={(e) => setHasBox(e.target.checked)}
                      className="w-5 h-5 text-[#3366FF] rounded border-border focus:ring-[#3366FF] cursor-pointer"
                    />
                    <span className="ml-3 text-sm text-foreground">
                      Original Box
                    </span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasInsoles}
                      onChange={(e) => setHasInsoles(e.target.checked)}
                      className="w-5 h-5 text-[#3366FF] rounded border-border focus:ring-[#3366FF] cursor-pointer"
                    />
                    <span className="ml-3 text-sm text-foreground">Insoles</span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasLaces}
                      onChange={(e) => setHasLaces(e.target.checked)}
                      className="w-5 h-5 text-[#3366FF] rounded border-border focus:ring-[#3366FF] cursor-pointer"
                    />
                    <span className="ml-3 text-sm text-foreground">
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
                    className="text-sm font-medium text-foreground"
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
        <div className="sticky bottom-0 bg-card border-t p-4 sm:px-6">
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
                  setUploadedPhotos({});
                }}
                className="flex-1 h-12"
              >
                Back
              </Button>
              <Button
                onClick={handleAddToList}
                disabled={
                  !size || !tradeValue || (condition < 10 && !allPhotosUploaded)
                }
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
};

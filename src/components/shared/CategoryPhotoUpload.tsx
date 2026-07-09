// src/components/shared/CategoryPhotoUpload.tsx

import { useState } from "react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase/config";
import { Progress } from "@/components/ui/progress";
import imageCompression from "browser-image-compression";
import { Camera, Check, X, Loader2 } from "lucide-react";

interface CategoryPhotoUploadProps {
  category: string;
  categoryLabel: string;
  userId: string;
  listingId: string;
  existingPhotoUrl?: string;
  onUploadComplete: (category: string, downloadURL: string) => void;
  onUploadError: (error: Error) => void;
}

export const CategoryPhotoUpload = ({
  category,
  categoryLabel,
  userId,
  listingId,
  existingPhotoUrl,
  onUploadComplete,
  onUploadError,
}: CategoryPhotoUploadProps) => {
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(
    existingPhotoUrl
  );
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadComplete, setUploadComplete] = useState(!!existingPhotoUrl);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPreviewUrl(URL.createObjectURL(file));

    // Auto-upload on selection
    await startUpload(file);
  };

  const startUpload = async (file: File) => {
    setUploading(true);

    try {
      // Compress image
      const options = {
        maxSizeMB: 0.1,
        maxWidthOrHeight: 2200,
        useWebWorker: true,
      };

      const compressedFile = await imageCompression(file, options);

      // Upload to Firebase Storage
      const timestamp = Date.now();
      const path = `sneaker_uploads/${userId}/${listingId}/${category}/${timestamp}_${file.name}`;
      const storageRef = ref(storage, path);

      const uploadTask = uploadBytesResumable(storageRef, compressedFile);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const pct = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setProgress(pct);
        },
        (error) => {
          setUploading(false);
          onUploadError(error);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setUploading(false);
          setUploadComplete(true);
          onUploadComplete(category, downloadURL);
        }
      );
    } catch (error) {
      setUploading(false);
      onUploadError(
        error instanceof Error ? error : new Error("Upload failed")
      );
    }
  };

  return (
    <div className="border-2 border-dashed border-border rounded-lg p-4 hover:border-border/80 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {/* Placeholder icon - replace with actual icons later */}
          <div className="w-6 h-6 rounded bg-muted flex items-center justify-center">
            <Camera className="w-4 h-4 text-muted-foreground" />
          </div>
          <span className="text-sm font-medium text-foreground">
            {categoryLabel}
          </span>
        </div>

        {uploadComplete && (
          <div className="flex items-center gap-1 text-green-600">
            <Check className="w-5 h-5" />
            <span className="text-xs font-medium">Uploaded</span>
          </div>
        )}
      </div>

      {previewUrl ? (
        <div className="relative">
          <div className="aspect-square rounded-lg overflow-hidden bg-muted">
            <img
              src={previewUrl}
              alt={categoryLabel}
              className="w-full h-full object-cover"
            />
          </div>

          {uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-white animate-spin mx-auto mb-2" />
                <Progress value={progress} className="w-32 h-1 bg-white/20" />
                <p className="text-white text-xs mt-2">
                  {Math.round(progress)}%
                </p>
              </div>
            </div>
          )}

          {!uploading && (
            <button
              onClick={() => {
                setPreviewUrl(undefined);
                setUploadComplete(false);
              }}
              className="absolute top-2 right-2 p-1 bg-red-500 rounded-full text-white hover:bg-red-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        <label className="aspect-square flex flex-col items-center justify-center cursor-pointer bg-muted/50 rounded-lg hover:bg-muted transition-colors">
          <Camera className="w-8 h-8 text-muted-foreground mb-2" />
          <span className="text-xs text-muted-foreground">Tap to upload</span>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
};

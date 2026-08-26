import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { getStorage } from "firebase-admin/storage";

/**
 * Deletes all photos from storage when a listing is deleted
 */
export const deleteListingPhotos = onDocumentDeleted(
  {
    document: "listings/{listingId}",
    region: "us-central1",
  },
  async (event) => {
    const data = event.data?.data();
    const photos = data?.photos as
      | {
          appearance?: string;
          boxLabel?: string;
          insoles?: string;
          boxFrontal?: string;
          insoleStitching?: string;
          dateCode?: string;
        }
      | undefined;

    if (!photos) {
      logger.info("No photos to delete");
      return null;
    }

    const bucket = getStorage().bucket();
    const photoUrls = Object.values(photos).filter(Boolean);

    if (photoUrls.length === 0) {
      logger.info("No photo URLs found");
      return null;
    }

    // Extract storage paths from URLs and delete
    const deletePromises = photoUrls.map(async (photoUrl) => {
      try {
        // Extract path from Firebase Storage URL
        // Format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media...
        const url = new URL(photoUrl);
        const pathMatch = url.pathname.match(/\/o\/(.+)$/);
        if (!pathMatch) {
          logger.warn(`Could not extract path from URL: ${photoUrl}`);
          return;
        }

        const path = decodeURIComponent(pathMatch[1]);
        await bucket.file(path).delete();
        logger.info(`Deleted photo: ${path}`);
      } catch (error) {
        logger.error(`Error deleting photo from ${photoUrl}:`, error);
      }
    });

    await Promise.all(deletePromises);
    logger.info(
      `Cleaned up ${photoUrls.length} photos for listing ${event.params.listingId}`
    );
    return null;
  }
);

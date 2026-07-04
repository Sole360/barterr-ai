import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import axios from "axios";
import sharp from "sharp";
import { randomUUID } from "crypto";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const storage = admin.storage();

interface ImageJob {
  postId: string;
  styleId: string;
  imageUrl: string;
  source: "stockx" | "goat";
  status: "pending" | "processing" | "complete" | "failed";
  createdAt: admin.firestore.Timestamp;
  error?: string;
  firebaseUrl?: string;
}

export const processImageJobs = onDocumentCreated(
  "image_jobs/{jobId}",
  async (event) => {
    const snap = event.data;
    if (!snap) {
      logger.info("No data associated with the event");
      return;
    }

    const job = snap.data() as ImageJob;
    const jobId = event.params.jobId;

    logger.info(`Processing image job ${jobId} for styleId: ${job.styleId}`);

    try {
      // Update status to processing
      await snap.ref.update({ status: "processing" });

      // Check if image already exists in storage
      const storagePath = `sneakers/${job.styleId}/main.jpg`;
      const bucket = storage.bucket();
      const file = bucket.file(storagePath);

      const [exists] = await file.exists();

      let firebaseUrl: string;

      if (exists) {
        logger.info(`Image already exists for ${job.styleId}, reusing...`);

        // Get existing file metadata for download token
        const [metadata] = await file.getMetadata();
        const token =
          metadata.metadata?.firebaseStorageDownloadTokens ?? randomUUID();

        firebaseUrl = `https://firebasestorage.googleapis.com/v0/b/${
          bucket.name
        }/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
      } else {
        logger.info(`Downloading image from ${job.source}: ${job.imageUrl}`);

        // Download image from StockX/GOAT
        const response = await axios.get(job.imageUrl, {
          responseType: "arraybuffer",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          timeout: 30000,
        });

        logger.info(`Downloaded ${response.data.byteLength} bytes`);

        // Optimize image with sharp
        const optimizedImage = await sharp(response.data)
          .resize(1000, 1000, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({
            quality: 90,
            progressive: true,
          })
          .toBuffer();

        logger.info(`Optimized to ${optimizedImage.byteLength} bytes`);

        // Generate download token for public access
        const downloadToken = randomUUID();

        // Upload to Firebase Storage with token
        await file.save(optimizedImage, {
          metadata: {
            contentType: "image/jpeg",
            cacheControl: "public, max-age=31536000",
            metadata: {
              firebaseStorageDownloadTokens: downloadToken,
              styleId: job.styleId,
              source: job.source,
              originalUrl: job.imageUrl,
            },
          },
        });

        logger.info("Uploaded to Firebase Storage");

        // Build public URL with token
        firebaseUrl = `https://firebasestorage.googleapis.com/v0/b/${
          bucket.name
        }/o/${encodeURIComponent(
          storagePath
        )}?alt=media&token=${downloadToken}`;
        logger.info(`Public URL: ${firebaseUrl}`);
      }

      // Update Post with Firebase URL
      await db.collection("posts").doc(job.postId).update({
        productImageUrl: firebaseUrl,
        updatedAt: admin.firestore.Timestamp.now(),
      });

      logger.info("Updated post with Firebase URL");

      // Mark job as complete
      await snap.ref.update({
        status: "complete",
        firebaseUrl,
      });

      logger.info(`Job ${jobId} completed successfully`);
    } catch (error: any) {
      logger.error(`Error processing job ${jobId}:`, error);

      // Mark job as failed
      await snap.ref.update({
        status: "failed",
        error: error.message ?? "Unknown error",
      });
    }
  }
);

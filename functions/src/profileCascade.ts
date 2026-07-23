import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { getFirestore, WriteBatch } from "firebase-admin/firestore";

/**
 * When a user changes their displayName or photoURL, propagate the new values to:
 *   1. listings — userName field (shown in trade compose + admin)
 *   2. conversations — participantInfo[uid] (shown in DM inbox)
 *
 * posts.owners[].displayName/userPhoto and posts.wishers[].displayName are not
 * rendered in the current UI, so they are skipped to keep batch sizes small.
 */
export const onUserProfileUpdate = onDocumentUpdated(
  "users/{userId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return null;

    const nameChanged = before.displayName !== after.displayName;
    const photoChanged = before.photoURL !== after.photoURL;
    if (!nameChanged && !photoChanged) return null;

    const uid = event.params.userId;
    const displayName: string = after.displayName ?? "";
    const photoURL: string = after.photoURL ?? "";

    const db = getFirestore();

    // Firestore batches are capped at 500 writes — flush and start a new one when full
    const batches: WriteBatch[] = [db.batch()];
    let opCount = 0;

    const addWrite = (ref: FirebaseFirestore.DocumentReference, data: object) => {
      if (opCount > 0 && opCount % 499 === 0) {
        batches.push(db.batch());
      }
      batches[batches.length - 1].update(ref, data);
      opCount++;
    };

    try {
      // 1. listings — update userName (and userPhoto if it exists on the doc)
      const listingsSnap = await db
        .collection("listings")
        .where("userId", "==", uid)
        .get();

      for (const docSnap of listingsSnap.docs) {
        const update: Record<string, string> = {};
        if (nameChanged) update.userName = displayName;
        addWrite(docSnap.ref, update);
      }

      // 2. conversations — update participantInfo[uid]
      const convsSnap = await db
        .collection("conversations")
        .where("participants", "array-contains", uid)
        .get();

      for (const docSnap of convsSnap.docs) {
        const update: Record<string, string> = {};
        if (nameChanged) update[`participantInfo.${uid}.displayName`] = displayName;
        if (photoChanged) update[`participantInfo.${uid}.photoURL`] = photoURL;
        addWrite(docSnap.ref, update);
      }

      await Promise.all(batches.map((b) => b.commit()));

      logger.info(
        `profileCascade: uid=${uid} updated ${listingsSnap.size} listing(s) ` +
          `and ${convsSnap.size} conversation(s).`
      );
    } catch (err) {
      logger.error(`profileCascade: uid=${uid} failed:`, err);
    }

    return null;
  }
);

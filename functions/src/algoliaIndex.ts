import {
  onDocumentWritten,
  onDocumentDeleted,
} from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { algoliasearch, type Algoliasearch } from "algoliasearch";

const ALGOLIA_INDEX_NAME = "user_POSTS";

function getAlgoliaClient(): Algoliasearch {
  const appId = process.env.ALGOLIA_APP_ID;
  const apiKey = process.env.ALGOLIA_ADMIN_API_KEY;

  if (!appId || !apiKey) {
    throw new Error(
      "Missing ALGOLIA_APP_ID or ALGOLIA_ADMIN_API_KEY environment variables"
    );
  }

  return algoliasearch(appId, apiKey);
}

async function savePostToAlgolia(object: any) {
  const client = getAlgoliaClient();

  await client.saveObjects({
    indexName: ALGOLIA_INDEX_NAME,
    objects: [object],
  });
}

async function deletePostFromAlgolia(objectID: string) {
  const client = getAlgoliaClient();

  await client.deleteObjects({
    indexName: ALGOLIA_INDEX_NAME,
    objectIDs: [objectID],
  });
}

// Index or update listing
export const indexPost = onDocumentWritten(
  {
    document: "listings/{postId}",
    secrets: ["ALGOLIA_APP_ID", "ALGOLIA_ADMIN_API_KEY"],
  },
  async (event) => {
    const postId = event.params.postId;
    const data = event.data?.after?.data();

    // If document was deleted, skip (handled by unindexPost)
    if (!data) return null;

    // If inactive, remove from index instead of saving
    if (data.active === false) {
      try {
        await deletePostFromAlgolia(postId);
        logger.info(`Removed inactive post ${postId} from Algolia`);
      } catch (error) {
        logger.error(`Error removing inactive post ${postId}:`, error);
      }
      return null;
    }

    const algoliaObject = {
      objectID: postId,
      postId: data.postId ?? "",
      productName: data.productName ?? "",
      brand: data.brand ?? "",
      styleId: data.styleId ?? "",
      size: data.size ?? null,
      productImageUrl: data.productImageUrl ?? "",
      apiID: data.apiID ?? "",
      active: data.active,
      postedAt: data.postedAt?.seconds ?? Math.floor(Date.now() / 1000),
      updatedAt: data.updatedAt?.seconds ?? Math.floor(Date.now() / 1000),
    };

    try {
      await savePostToAlgolia(algoliaObject);
      logger.info(`Indexed post ${postId}`);
    } catch (error) {
      logger.error(`Error indexing post ${postId}:`, error);
    }

    return null;
  }
);

// ─── User index ───────────────────────────────────────────────────────────────

export const indexUser = onDocumentWritten(
  {
    document: "users/{userId}",
    secrets: ["ALGOLIA_APP_ID", "ALGOLIA_ADMIN_API_KEY"],
  },
  async (event) => {
    const userId = event.params.userId;
    const data = event.data?.after?.data();

    if (!data) return null;

    // Skip re-index if none of the search-relevant fields changed.
    // This prevents every numNotification increment or address save from
    // triggering an unnecessary Algolia write operation.
    const before = event.data?.before?.data();
    const fingerprint = (d: Record<string, unknown> | undefined) =>
      [d?.displayName, d?.photoURL, d?.location].join("|");
    if (before && fingerprint(before) === fingerprint(data)) return null;

    const client = getAlgoliaClient();
    try {
      await client.saveObjects({
        indexName: "barterr_users",
        objects: [
          {
            objectID: userId,
            displayName: data.displayName ?? "",
            photoURL: data.photoURL ?? "",
            location: data.location ?? "",
          },
        ],
      });
      logger.info(`Indexed user ${userId}`);
    } catch (error) {
      logger.error(`Error indexing user ${userId}:`, error);
    }

    return null;
  }
);

export const unindexUser = onDocumentDeleted(
  {
    document: "users/{userId}",
    secrets: ["ALGOLIA_APP_ID", "ALGOLIA_ADMIN_API_KEY"],
  },
  async (event) => {
    const userId = event.params.userId;
    const client = getAlgoliaClient();
    try {
      await client.deleteObjects({ indexName: "barterr_users", objectIDs: [userId] });
      logger.info(`Removed user ${userId} from index`);
    } catch (error) {
      logger.error(`Error removing user ${userId} from index:`, error);
    }
    return null;
  }
);

// Remove from index when deleted
export const unindexPost = onDocumentDeleted(
  {
    document: "listings/{postId}",
    secrets: ["ALGOLIA_APP_ID", "ALGOLIA_ADMIN_API_KEY"],
  },
  async (event) => {
    const postId = event.params.postId;

    try {
      await deletePostFromAlgolia(postId);
      logger.info(`Removed post ${postId} from index`);
    } catch (error) {
      logger.error(`Error removing post ${postId} from index:`, error);
    }

    return null;
  }
);

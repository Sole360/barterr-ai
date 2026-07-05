// src/lib/algolia/config.ts

import { liteClient, type LiteClient } from "algoliasearch/lite";

const ALGOLIA_APP_ID = import.meta.env.VITE_ALGOLIA_APP_ID;
const ALGOLIA_SEARCH_API_KEY = import.meta.env.VITE_ALGOLIA_SEARCH_API_KEY;

export const ALGOLIA_INDEX = "user_POSTS";
export const ALGOLIA_USERS_INDEX = "barterr_users";

if (!ALGOLIA_APP_ID || !ALGOLIA_SEARCH_API_KEY) {
  throw new Error("Algolia credentials are not set in environment variables");
}

// In v5, liteClient is the browser client factory
export const searchClient: LiteClient = liteClient(
  ALGOLIA_APP_ID,
  ALGOLIA_SEARCH_API_KEY
);

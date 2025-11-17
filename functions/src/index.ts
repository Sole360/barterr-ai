import { processImageJobs } from "./processImageJobs";
import { indexPost, unindexPost } from "./algoliaIndex";
import { setGlobalOptions } from "firebase-functions";
setGlobalOptions({ maxInstances: 10 });

export { processImageJobs, indexPost, unindexPost };

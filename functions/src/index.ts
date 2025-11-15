import { processImageJobs } from "./processImageJobs";
import { setGlobalOptions } from "firebase-functions";
setGlobalOptions({ maxInstances: 10 });

export { processImageJobs };

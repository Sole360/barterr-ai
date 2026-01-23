import { processImageJobs } from "./processImageJobs";
import { indexPost, unindexPost } from "./algoliaIndex";
import { setGlobalOptions } from "firebase-functions";
import { deleteListingPhotos } from "./cleanupPhotoStorage";
import { createSetupIntent, setDefaultPaymentMethod } from "./stripeSetupIntent";
import { acceptTrade, onTradeConfirmed, retryPayment } from "./tradePayments";

setGlobalOptions({ maxInstances: 10 });

export {
  processImageJobs,
  indexPost,
  unindexPost,
  deleteListingPhotos,
  createSetupIntent,
  setDefaultPaymentMethod,
  acceptTrade,
  onTradeConfirmed,
  retryPayment,
};

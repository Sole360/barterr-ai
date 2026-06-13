import { processImageJobs } from "./processImageJobs";
import { indexPost, unindexPost } from "./algoliaIndex";
import { setGlobalOptions } from "firebase-functions";
import { deleteListingPhotos } from "./cleanupPhotoStorage";
import { createSetupIntent, setDefaultPaymentMethod } from "./stripeSetupIntent";
import { acceptTrade, onTradeConfirmed, retryPayment } from "./tradePayments";
import {
  onNewTrade,
  onTradeStatusChange,
  sendWeeklyReminder,
  sendEmailMessage,
  onMatchPostCriteria,
  onFakeShoes,
  onShippingLabelCreated,
  onSneakersReceived,
} from "./emailNotifications";

setGlobalOptions({ maxInstances: 10 });

export {
  // Image processing
  processImageJobs,
  // Search
  indexPost,
  unindexPost,
  // Storage
  deleteListingPhotos,
  // Stripe
  createSetupIntent,
  setDefaultPaymentMethod,
  // Payments
  acceptTrade,
  onTradeConfirmed,
  retryPayment,
  // Email notifications
  onNewTrade,
  onTradeStatusChange,
  sendWeeklyReminder,
  sendEmailMessage,
  onMatchPostCriteria,
  onFakeShoes,
  onShippingLabelCreated,
  onSneakersReceived,
};

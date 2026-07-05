import { processImageJobs } from "./processImageJobs";
import { indexPost, unindexPost, indexUser, unindexUser } from "./algoliaIndex";
import { onNewTradeNotification, onTradeStatusNotification } from "./notificationTriggers";
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
  onOutboundLabelCreated,
} from "./emailNotifications";
import {
  createShippoLabel,
  createShippoTransaction,
  purchaseShippoLabel,
  onTradeCompleted,
  markSneakersReceived,
  markAuthResult,
  createOutboundLabel,
} from "./shipping";

setGlobalOptions({ maxInstances: 10 });

export {
  // Image processing
  processImageJobs,
  // Search
  indexPost,
  unindexPost,
  indexUser,
  unindexUser,
  // Notifications
  onNewTradeNotification,
  onTradeStatusNotification,
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
  onOutboundLabelCreated,
  // Shipping
  createShippoLabel,
  createShippoTransaction,
  purchaseShippoLabel,
  onTradeCompleted,
  markSneakersReceived,
  markAuthResult,
  createOutboundLabel,
};

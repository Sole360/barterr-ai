import { processImageJobs } from "./processImageJobs";
import { indexPost, unindexPost, indexUser, unindexUser } from "./algoliaIndex";
import { onNewTradeNotification, onTradeStatusNotification } from "./notificationTriggers";
import { setAdminRole, disableUser, enableUser, resolveFlaggedAttempt, reviewListing } from "./adminActions";
import { setGlobalOptions } from "firebase-functions";
import { deleteListingPhotos } from "./cleanupPhotoStorage";
import { createSetupIntent, setDefaultPaymentMethod } from "./stripeSetupIntent";
import { acceptTrade, onTradeConfirmed, retryPayment } from "./tradePayments";
import { getRevenueStats } from "./stripeReporting";
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
  // Admin
  setAdminRole,
  disableUser,
  enableUser,
  resolveFlaggedAttempt,
  reviewListing,
  // Storage
  deleteListingPhotos,
  // Stripe
  createSetupIntent,
  setDefaultPaymentMethod,
  // Payments
  acceptTrade,
  onTradeConfirmed,
  retryPayment,
  // Stripe reporting
  getRevenueStats,
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

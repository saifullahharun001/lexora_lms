export const NOTIFICATION_AUDIT_EVENTS = {
  EVENT_EMITTED: "notification.event.emitted",
  EVENT_PROCESSING_FAILED: "notification.event.processing-failed",
  TEMPLATE_CREATED: "notification.template.created",
  TEMPLATE_UPDATED: "notification.template.updated",
  NOTIFICATION_CREATED: "notification.notification.created",
  NOTIFICATION_DISMISSED: "notification.notification.dismissed",
  DELIVERY_ATTEMPTED: "notification.delivery.attempted",
  DELIVERY_FAILED: "notification.delivery.failed",
  DELIVERY_RETRY_SCHEDULED: "notification.delivery.retry-scheduled",
  PREFERENCE_UPDATED: "notification.preference.updated",
  PUSH_SUBSCRIPTION_REGISTERED: "notification.push-subscription.registered",
  PUSH_SUBSCRIPTION_REVOKED: "notification.push-subscription.revoked"
} as const;

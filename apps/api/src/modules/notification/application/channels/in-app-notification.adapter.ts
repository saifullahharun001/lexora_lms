import type { Notification } from "../../contracts/notification.contracts";

export interface InAppNotificationChannelAdapter {
  send(notification: Notification): Promise<void>;
}

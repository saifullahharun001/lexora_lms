# Notification Foundation

## Strategy Explanation

The notification foundation provides a modular, department-scoped event-to-notification pipeline that can support in-app, email, and future push delivery without implementing workers, notification-center UI, or transport-specific delivery infrastructure yet.

This design follows these rules:

- notifications are event-driven and append-oriented
- department scope is preserved whenever the source event belongs to a department context
- event payloads store only safe notification-oriented metadata, not full academic records
- notification preferences may mute non-critical communication but cannot fully suppress critical academic or security messaging
- delivery attempts are tracked separately from notification records
- channel adapters remain pluggable so in-app, email, and push can evolve independently
- public-verification related notifications must remain privacy-safe and must not reveal protected student data

This phase does not implement delivery workers, real SMTP sending, PWA push execution, or a UI notification center.

## Domain Model

### NotificationEvent

- Canonical domain event for notification orchestration
- Stores event code, intended channel targets, minimal payload/context metadata, dedupe key, status, and processing timestamps
- Represents the event-to-notification mapping boundary rather than the user-visible message itself

### Notification

- User-facing notification record
- Stores recipient, primary channel, content snapshot, action URL, criticality flag, lifecycle state, and read/dismiss timestamps
- Supports in-app notification as the first durable user-facing foundation

### NotificationDelivery

- Delivery-attempt record for one notification and one channel
- Tracks attempt number, destination, provider references, retry counters, next retry timestamp, and failure metadata
- Enables idempotent delivery management without mutating the logical notification record itself

### NotificationTemplate

- Department-aware message template for one event code, channel, and locale
- Stores subject/title/body templates, variable metadata, lifecycle state, and criticality
- Supports both department-specific templates and platform-default templates through nullable department scope

### NotificationPreference

- User-level preference record for one event code and one channel
- Stores opt-in state, critical-lock flag, and optional settings metadata
- Allows user control for non-critical communication while preserving mandatory notifications

### PushSubscription Placeholder

- Placeholder record for future browser/PWA push capability
- Stores endpoint, endpoint hash, keys, device/user agent hints, and activity/revocation timestamps
- Does not implement actual web-push delivery yet

## Prisma Schema Additions

Added enums:

- `NotificationEventStatus`
- `NotificationRecordStatus`
- `NotificationDeliveryStatus`
- `NotificationTemplateStatus`
- `NotificationChannel`

Added models:

- `NotificationEvent`
- `Notification`
- `NotificationDelivery`
- `NotificationTemplate`
- `NotificationPreference`
- `PushSubscription`

Added relations on existing models:

- `Department`
  - `notificationEvents`
  - `notifications`
  - `notificationDeliveries`
  - `notificationTemplates`
  - `notificationPreferences`
  - `pushSubscriptions`
- `User`
  - `notificationEventsTriggered`
  - `notificationsRecipient`
  - `notificationsCreated`
  - `notificationDeliveriesProcessed`
  - `notificationTemplatesCreated`
  - `notificationTemplatesUpdated`
  - `notificationPreferences`
  - `pushSubscriptions`

Representative Prisma additions:

```prisma
enum NotificationEventStatus {
  RECEIVED
  MAPPED
  PROCESSED
  FAILED
  CANCELED
}

enum NotificationRecordStatus {
  PENDING
  READY
  SENT
  READ
  DISMISSED
  FAILED
}

enum NotificationDeliveryStatus {
  PENDING
  SENT
  DELIVERED
  FAILED
  RETRY_SCHEDULED
  CANCELED
}

enum NotificationTemplateStatus {
  DRAFT
  ACTIVE
  INACTIVE
  ARCHIVED
}

enum NotificationChannel {
  IN_APP
  EMAIL
  PUSH
}

model NotificationEvent {
  id             String                @id @default(cuid())
  departmentId   String?               @map("department_id")
  eventCode      String                @map("event_code")
  channelTargets NotificationChannel[] @map("channel_targets")
  status         NotificationEventStatus @default(RECEIVED)
  payloadJson    Json?                 @map("payload_json")
  contextJson    Json?                 @map("context_json")
  dedupeKey      String?               @map("dedupe_key")
}

model Notification {
  id                  String                 @id @default(cuid())
  departmentId        String?                @map("department_id")
  notificationEventId String?                @map("notification_event_id")
  recipientUserId     String                 @map("recipient_user_id")
  templateId          String?                @map("template_id")
  primaryChannel      NotificationChannel    @map("primary_channel")
  status              NotificationRecordStatus @default(PENDING)
  eventCode           String                 @map("event_code")
  subject             String?
  title               String?
  body                String?
  payloadJson         Json?                  @map("payload_json")
  isCritical          Boolean                @default(false) @map("is_critical")
}

model NotificationDelivery {
  id                String                   @id @default(cuid())
  notificationId    String                   @map("notification_id")
  channel           NotificationChannel
  status            NotificationDeliveryStatus @default(PENDING)
  destination       String?
  providerMessageId String?                  @map("provider_message_id")
  attemptNumber     Int                      @default(1) @map("attempt_number")
  retryCount        Int                      @default(0) @map("retry_count")
  nextRetryAt       DateTime?                @map("next_retry_at")
}

model NotificationTemplate {
  id              String                   @id @default(cuid())
  departmentId    String?                  @map("department_id")
  code            String
  eventCode       String                   @map("event_code")
  channel         NotificationChannel
  status          NotificationTemplateStatus @default(DRAFT)
  locale          String                   @default("en")
  subjectTemplate String?                  @map("subject_template")
  titleTemplate   String?                  @map("title_template")
  bodyTemplate    String                   @map("body_template")
  variablesJson   Json?                    @map("variables_json")
  isCritical      Boolean                  @default(false) @map("is_critical")
}

model NotificationPreference {
  id               String              @id @default(cuid())
  departmentId     String?             @map("department_id")
  userId           String              @map("user_id")
  eventCode        String              @map("event_code")
  channel          NotificationChannel
  isEnabled        Boolean             @default(true) @map("is_enabled")
  isCriticalLocked Boolean             @default(false) @map("is_critical_locked")
}

model PushSubscription {
  id           String    @id @default(cuid())
  departmentId String?   @map("department_id")
  userId       String    @map("user_id")
  endpoint     String    @unique
  endpointHash String    @unique @map("endpoint_hash")
  p256dhKey    String?   @map("p256dh_key")
  authKey      String?   @map("auth_key")
  isActive     Boolean   @default(true) @map("is_active")
}
```

## Enums

### Notification Events

- `RECEIVED`
- `MAPPED`
- `PROCESSED`
- `FAILED`
- `CANCELED`

### Notification Records

- `PENDING`
- `READY`
- `SENT`
- `READ`
- `DISMISSED`
- `FAILED`

### Delivery Attempts

- `PENDING`
- `SENT`
- `DELIVERED`
- `FAILED`
- `RETRY_SCHEDULED`
- `CANCELED`

### Template Status

- `DRAFT`
- `ACTIVE`
- `INACTIVE`
- `ARCHIVED`

### Notification Channels

- `IN_APP`
- `EMAIL`
- `PUSH`

## Event-Trigger Mapping

### Academic and Student Lifecycle

- enrollment success:
  - event code: `enrollment.success`
  - channels: `IN_APP`, optional `EMAIL`
  - audience: enrolled student
- class/session update:
  - event code: `class-session.updated`
  - channels: `IN_APP`, optional `EMAIL`
  - audience: enrolled students, assigned teachers as needed
- attendance warning:
  - event code: `attendance.warning`
  - channels: `IN_APP`, optional `EMAIL`
  - audience: student
- eligibility warning:
  - event code: `eligibility.warning`
  - channels: `IN_APP`, optional `EMAIL`
  - audience: student

### Assessment

- assignment created:
  - event code: `assignment.created`
  - channels: `IN_APP`, optional `EMAIL`, future `PUSH`
  - audience: enrolled students
- assignment deadline reminder:
  - event code: `assignment.deadline-reminder`
  - channels: `IN_APP`, `EMAIL`, future `PUSH`
  - audience: target students
- assignment feedback/resubmission request:
  - event code: `assignment.feedback-requested`
  - channels: `IN_APP`, optional `EMAIL`
  - audience: submitting student
- quiz availability:
  - event code: `quiz.available`
  - channels: `IN_APP`, optional `EMAIL`, future `PUSH`
  - audience: enrolled students
- quiz result status:
  - event code: `quiz.result-status`
  - channels: `IN_APP`, optional `EMAIL`
  - audience: student

### Result Processing

- result publication:
  - event code: `result.published`
  - channels: `IN_APP`, `EMAIL`
  - audience: student
- result amendment update:
  - event code: `result.amendment-updated`
  - channels: `IN_APP`, `EMAIL`
  - audience: affected student

### Transcript Verification

- transcript availability:
  - event code: `transcript.available`
  - channels: `IN_APP`, optional `EMAIL`
  - audience: student
- transcript verification/revocation:
  - event code: `transcript.revoked`
  - channels: `IN_APP`, `EMAIL`
  - audience: affected student and administrative staff as policy allows

### Discussion Placeholder

- discussion replies/moderation placeholder:
  - event code: `discussion.reply`
  - event code: `discussion.moderation`
  - channels: `IN_APP`, future `PUSH`
  - audience: participants or moderators according to module policy

## Rules and Constraints

- all notifications are department-scoped where the source action is department-scoped
- platform-default templates may use nullable `departmentId`, but issued notifications should still preserve effective department context when available
- notification event payloads must avoid storing sensitive full records, raw submissions, full transcript bodies, or complete result sheets
- event payloads should store identifiers, display-safe summaries, and rendering variables only
- user preferences control non-critical notifications only
- critical academic or security notifications cannot be fully disabled
- delivery must be idempotent through dedupe keys, per-notification delivery uniqueness, and attempt tracking
- retry metadata must be tracked in `NotificationDelivery`
- public-verification-related notifications must not leak private academic data
- in-app notification persistence and channel delivery tracking are separate concerns

## Authorization and Audit Notes

### Authorization

- create templates:
  - `department_admin`
  - authorized support or communications operators if later introduced by policy
- trigger system notifications:
  - internal application services
  - `department_admin` for department broadcasts or administrative notifications
  - assigned teachers only for explicitly scoped course-context notifications if later allowed
- view own notifications:
  - `student`, `teacher`, `department_admin`, `support`, `auditor` for self only
- view department delivery logs:
  - `department_admin`
  - `auditor`
  - limited `support` by policy

### Audit-Worthy Notification Actions

- notification event emitted for critical workflows
- template created or updated
- critical notification created
- delivery failure for critical notification
- retry scheduling for critical notification
- preference changes affecting academic or security communications
- push subscription registration or revocation

## Adapter / Channel Design

### In-App Channel

- durable channel backed by `Notification`
- supports unread/read/dismissed lifecycle
- no separate worker required for foundation stage

### Email Channel

- backed by `NotificationDelivery`
- uses templates plus email config foundation
- actual SMTP transport remains outside this phase

### Push Channel Placeholder

- backed by `PushSubscription` plus `NotificationDelivery`
- intended for browser/PWA push later
- actual web-push transport and subscription verification remain outside this phase

### Event-to-Channel Flow

1. module service emits `NotificationEvent`
2. mapping layer resolves recipient list, channel targets, and template candidates
3. one or more `Notification` records are created
4. `NotificationDelivery` rows are created per channel attempt
5. channel adapter interfaces handle actual send behavior later

## NestJS Scaffolding

Folder shape:

```text
notification/
  application/
    channels/
    ports/
    services/
  contracts/
  domain/
```

Public contracts:

- `NotificationEvent`
- `Notification`
- `NotificationDelivery`
- `NotificationTemplate`
- `NotificationPreference`
- `PushSubscription`

Repository boundary:

- repository port owns notification events, notifications, deliveries, templates, preferences, and push subscriptions
- source modules should emit notification intents through contracts rather than directly persisting notification tables

Service boundary:

- service orchestrates event emission, template resolution, notification creation, delivery tracking, preference updates, and push-subscription registration
- actual send transports remain behind channel adapter interfaces

Policy names:

- `notification.notification.read`
- `notification.notification.self-read`
- `notification.notification.event-trigger`
- `notification.notification-template.manage`
- `notification.delivery.read`
- `notification.preference.update`
- `notification.push-subscription.self-manage`

Audit events:

- `notification.event.emitted`
- `notification.event.processing-failed`
- `notification.template.created`
- `notification.template.updated`
- `notification.notification.created`
- `notification.notification.dismissed`
- `notification.delivery.attempted`
- `notification.delivery.failed`
- `notification.delivery.retry-scheduled`
- `notification.preference.updated`
- `notification.push-subscription.registered`
- `notification.push-subscription.revoked`

Channel adapter interfaces:

- `InAppNotificationChannelAdapter`
- `EmailNotificationChannelAdapter`
- `PushNotificationChannelAdapter`

Implemented scaffolding files:

- `apps/api/src/modules/notification/contracts/notification.contracts.ts`
- `apps/api/src/modules/notification/application/ports/notification.repository.port.ts`
- `apps/api/src/modules/notification/application/services/notification.service.ts`
- `apps/api/src/modules/notification/application/channels/in-app-notification.adapter.ts`
- `apps/api/src/modules/notification/application/channels/email-notification.adapter.ts`
- `apps/api/src/modules/notification/application/channels/push-notification.adapter.ts`
- `apps/api/src/modules/notification/domain/notification.policy-names.ts`
- `apps/api/src/modules/notification/domain/notification.audit-events.ts`

## Document Content

This document intentionally establishes only the notification foundation. Delivery workers, a notification center UI, template editors, and real transport integrations remain out of scope until the event model, privacy rules, and delivery tracking semantics are stable.

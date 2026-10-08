# Notification

Notifications use an event-driven, department-scoped pipeline with separate logical notification and channel-delivery records. Event payloads must remain minimal and privacy-safe.

**Classification:** implemented in-app/API foundation, server/runtime verified for recorded event, recipient isolation, read/dismiss, dedupe, template and preference matrix. Real email, push and queue-worker delivery are **pending**. [Runtime index](runtime-test-checklist.md#current-verified-baseline-index).

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


## Current API and security boundary

All paths are under /api/v1, authenticated with AuthGuard, PolicyGuard and @RequirePolicy(). Principal department is authoritative; x-department-id cannot override it.

| Method | Path (under /api/v1) | Policy |
| --- | --- | --- |
| GET | `/notification-preferences/me` | `notification.notification.self-read` |
| PATCH | `/notification-preferences/me` | `notification.preference.update` |
| POST | `/notification-templates` | `notification.notification-template.manage` |
| GET | `/notification-templates` | `notification.notification-template.manage` |
| PATCH | `/notification-templates/:id` | `notification.notification-template.manage` |
| POST | `/notifications/events` | `notification.notification.event-trigger` |
| GET | `/notifications` | `notification.notification.self-read` |
| GET | `/notifications/:id` | `notification.notification.self-read` |
| PATCH | `/notifications/:id/read` | `notification.notification.self-read` |
| PATCH | `/notifications/:id/dismiss` | `notification.notification.self-read` |


Students and ordinary users access only their own recipient records/preferences. Department Admin can list/read own-department notifications with recipient/event filters; that does not authorize cross-department access. Template management/event triggering require explicit authority. Teacher broadcasts are only a target possibility when separately scoped and allowed.

The runtime campaign verified student-to-student safe denial, same-department admin filtering, repeated dedupe-key reuse returning the existing event, template create/list/update and critical preference protection. Mixed-channel events produced READY in-app records and PENDING EMAIL/PUSH placeholder deliveries with no provider IDs or sent/delivered timestamps. These are not transport success evidence.

## Delivery and remaining work

Source modules emit intents through notification contracts. NotificationEvent is the orchestration input; Notification is the durable recipient/content snapshot; NotificationDelivery owns per-channel attempts, retry counts, nextRetryAt, provider references and failure state. A retry must not duplicate the logical notification or silently lose department/actor provenance.

InAppNotificationChannelAdapter, EmailNotificationChannelAdapter and PushNotificationChannelAdapter separate channel behavior. Nullable department on platform-default templates never grants cross-department delivery authority. Public-verification notices must not reveal protected academic data.

**Pending:** real SMTP/email and web-push transport, verified push subscriptions, queue workers/retry execution, full template rendering/editor, notification-center UI, monitoring and critical-delivery escalation. Intended event mappings above are durable design; they do not prove every source workflow is wired.

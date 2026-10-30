import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  date,
  check,
  jsonb,
} from "drizzle-orm/pg-core";
import type { StoredRecurrence } from "../validation/recurrence";
import { sql } from "drizzle-orm";

const instant = (name: string) => timestamp(name, { withTimezone: true });
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: instant("created_at").notNull().defaultNow(),
  updatedAt: instant("updated_at").notNull().defaultNow(),
});
export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    expiresAt: instant("expires_at").notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
    updatedAt: instant("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_idx").on(table.userId)],
);
export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: instant("access_token_expires_at"),
    refreshTokenExpiresAt: instant("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: instant("created_at").notNull().defaultNow(),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("account_user_idx").on(table.userId),
    uniqueIndex("account_provider_identity_idx").on(
      table.providerId,
      table.accountId,
    ),
  ],
);
export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: instant("expires_at").notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);
export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  timeZone: text("time_zone").notNull().default("UTC"),
  reviewedAt: instant("reviewed_at"),
  createdAt: instant("created_at").notNull().defaultNow(),
  updatedAt: instant("updated_at").notNull().defaultNow(),
});
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    expiresAt: instant("expires_at").notNull(),
  },
  (table) => [index("rate_limits_expiry_idx").on(table.expiresAt)],
);

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    sourceText: text("source_text"),
    recurrence: jsonb("recurrence").$type<StoredRecurrence>(),
    occurrenceAnchorAt: instant("occurrence_anchor_at"),
    deadlineNotificationEnabled: boolean("deadline_notification_enabled")
      .notNull()
      .default(false),
    dueAt: instant("due_at").notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    deadlineType: text("deadline_type", {
      enum: ["date_only", "date_time"],
    }).notNull(),
    timeZone: text("time_zone").notNull(),
    priority: text("priority", { enum: ["low", "normal", "high"] })
      .notNull()
      .default("normal"),
    status: text("status", { enum: ["active", "completed", "archived"] })
      .notNull()
      .default("active"),
    completedAt: instant("completed_at"),
    deletedAt: instant("deleted_at"),
    scheduleVersion: integer("schedule_version").notNull().default(1),
    revision: integer("revision").notNull().default(1),
    createdAt: instant("created_at").notNull().defaultNow(),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("reminders_owner_deadline_idx")
      .on(t.userId, t.status, t.dueAt, t.id)
      .where(sql`${t.deletedAt} is null`),
    check(
      "reminder_title_length",
      sql`char_length(btrim(${t.title})) between 1 and 160`,
    ),
    check(
      "reminder_description_length",
      sql`${t.description} is null or char_length(${t.description}) <= 2000`,
    ),
    check(
      "reminder_source_length",
      sql`${t.sourceText} is null or char_length(${t.sourceText}) <= 4000`,
    ),
    check(
      "reminder_status_valid",
      sql`${t.status} in ('active','completed','archived')`,
    ),
    check(
      "reminder_priority_valid",
      sql`${t.priority} in ('low','normal','high')`,
    ),
    check(
      "reminder_deadline_type_valid",
      sql`${t.deadlineType} in ('date_only','date_time')`,
    ),
    index("reminders_recurring_due_idx")
      .on(t.dueAt, t.id)
      .where(
        sql`${t.recurrence} is not null and ${t.status} = 'active' and ${t.deletedAt} is null`,
      ),
    check(
      "reminder_recurrence_valid",
      sql`${t.recurrence} is null or coalesce((jsonb_typeof(${t.recurrence}) = 'object' and ${t.recurrence}->>'frequency' in ('daily','weekly','monthly') and (${t.recurrence}->>'interval')::integer between 1 and 365 and ${t.recurrence}->>'anchorDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and ${t.recurrence}->>'localTime' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and jsonb_typeof(${t.recurrence}->'weekdays') = 'array'), false)`,
    ),
    check(
      "reminder_occurrence_anchor_valid",
      sql`(${t.recurrence} is null and ${t.occurrenceAnchorAt} is null) or (${t.recurrence} is not null and ${t.occurrenceAnchorAt} is not null)`,
    ),
    check(
      "reminder_versions_positive",
      sql`${t.scheduleVersion} > 0 and ${t.revision} > 0`,
    ),
    check(
      "reminder_completed_timestamp",
      sql`${t.status} <> 'completed' or ${t.completedAt} is not null`,
    ),
  ],
);
export const scheduledNotifications = pgTable(
  "scheduled_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reminderId: uuid("reminder_id")
      .notNull()
      .references(() => reminders.id, { onDelete: "cascade" }),
    thresholdPercent: integer("threshold_percent").notNull(),
    scheduleVersion: integer("schedule_version").notNull(),
    scheduledFor: instant("scheduled_for").notNull(),
    status: text("status", {
      enum: ["pending", "processing", "sent", "failed", "cancelled"],
    })
      .notNull()
      .default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: instant("next_attempt_at"),
    processingStartedAt: instant("processing_started_at"),
    claimToken: uuid("claim_token"),
    recoveryCount: integer("recovery_count").notNull().default(0),
    sentAt: instant("sent_at"),
    providerMessageId: text("provider_message_id"),
    lastErrorCode: text("last_error_code"),
    cancellationReason: text("cancellation_reason"),
    createdAt: instant("created_at").notNull().defaultNow(),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notification_reminder_version_threshold_idx").on(
      t.reminderId,
      t.scheduleVersion,
      t.thresholdPercent,
    ),
    index("notification_due_idx")
      .on(t.scheduledFor, t.id)
      .where(sql`${t.status} = 'pending'`),
    index("notification_retry_idx")
      .on(t.nextAttemptAt, t.id)
      .where(sql`${t.status} = 'pending' and ${t.nextAttemptAt} is not null`),
    index("notification_stale_idx")
      .on(t.processingStartedAt)
      .where(sql`${t.status} = 'processing'`),
    check(
      "notification_threshold_valid",
      sql`${t.thresholdPercent} in (50,75,90,100)`,
    ),
    check(
      "notification_status_valid",
      sql`${t.status} in ('pending','processing','sent','failed','cancelled')`,
    ),
    check(
      "notification_counters_valid",
      sql`${t.attemptCount} >= 0 and ${t.recoveryCount} >= 0 and ${t.scheduleVersion} > 0`,
    ),
  ],
);
export const notificationAttempts = pgTable(
  "notification_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => scheduledNotifications.id, { onDelete: "cascade" }),
    attemptedAt: instant("attempted_at").notNull().defaultNow(),
    result: text("result").notNull(),
    errorCategory: text("error_category"),
    errorMessage: text("error_message"),
    providerMessageId: text("provider_message_id"),
  },
  (t) => [
    index("notification_attempt_history_idx").on(
      t.notificationId,
      t.attemptedAt,
    ),
  ],
);

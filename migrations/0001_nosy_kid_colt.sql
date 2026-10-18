CREATE TABLE "notification_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result" text NOT NULL,
	"error_category" text,
	"error_message" text,
	"provider_message_id" text
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"source_text" text,
	"due_at" timestamp with time zone NOT NULL,
	"due_date" date NOT NULL,
	"deadline_type" text NOT NULL,
	"time_zone" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"completed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"schedule_version" integer DEFAULT 1 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_title_length" CHECK (char_length(btrim("reminders"."title")) between 1 and 160),
	CONSTRAINT "reminder_description_length" CHECK ("reminders"."description" is null or char_length("reminders"."description") <= 2000),
	CONSTRAINT "reminder_source_length" CHECK ("reminders"."source_text" is null or char_length("reminders"."source_text") <= 4000),
	CONSTRAINT "reminder_status_valid" CHECK ("reminders"."status" in ('active','completed','archived')),
	CONSTRAINT "reminder_priority_valid" CHECK ("reminders"."priority" in ('low','normal','high')),
	CONSTRAINT "reminder_deadline_type_valid" CHECK ("reminders"."deadline_type" in ('date_only','date_time')),
	CONSTRAINT "reminder_versions_positive" CHECK ("reminders"."schedule_version" > 0 and "reminders"."revision" > 0),
	CONSTRAINT "reminder_completed_timestamp" CHECK ("reminders"."status" <> 'completed' or "reminders"."completed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "scheduled_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reminder_id" uuid NOT NULL,
	"threshold_percent" integer NOT NULL,
	"schedule_version" integer NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"processing_started_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"provider_message_id" text,
	"last_error_code" text,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_threshold_valid" CHECK ("scheduled_notifications"."threshold_percent" in (50,75,90)),
	CONSTRAINT "notification_status_valid" CHECK ("scheduled_notifications"."status" in ('pending','processing','sent','failed','cancelled')),
	CONSTRAINT "notification_counters_valid" CHECK ("scheduled_notifications"."attempt_count" >= 0 and "scheduled_notifications"."schedule_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "notification_attempts" ADD CONSTRAINT "notification_attempts_notification_id_scheduled_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."scheduled_notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_reminder_id_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."reminders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_attempt_history_idx" ON "notification_attempts" USING btree ("notification_id","attempted_at");--> statement-breakpoint
CREATE INDEX "reminders_owner_deadline_idx" ON "reminders" USING btree ("user_id","status","due_at","id") WHERE "reminders"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_reminder_version_threshold_idx" ON "scheduled_notifications" USING btree ("reminder_id","schedule_version","threshold_percent");--> statement-breakpoint
CREATE INDEX "notification_due_idx" ON "scheduled_notifications" USING btree ("scheduled_for","id") WHERE "scheduled_notifications"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "notification_retry_idx" ON "scheduled_notifications" USING btree ("next_attempt_at","id") WHERE "scheduled_notifications"."status" = 'pending' and "scheduled_notifications"."next_attempt_at" is not null;--> statement-breakpoint
CREATE INDEX "notification_stale_idx" ON "scheduled_notifications" USING btree ("processing_started_at") WHERE "scheduled_notifications"."status" = 'processing';
ALTER TABLE "scheduled_notifications" DROP CONSTRAINT "notification_threshold_valid";--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "deadline_notification_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "notification_threshold_valid" CHECK ("scheduled_notifications"."threshold_percent" in (50,75,90,100));
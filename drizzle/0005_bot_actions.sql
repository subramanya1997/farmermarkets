CREATE TYPE "public"."bot_action_status" AS ENUM('applied', 'pending', 'approved', 'dismissed');--> statement-breakpoint
CREATE TABLE "bot_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"market_id" text NOT NULL,
	"actor" text DEFAULT 'outreach-bot' NOT NULL,
	"note" text NOT NULL,
	"operator_email" text,
	"details" jsonb NOT NULL,
	"status" "bot_action_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"review_note" text
);
--> statement-breakpoint
CREATE INDEX "bot_actions_market_idx" ON "bot_actions" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "bot_actions_status_idx" ON "bot_actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bot_actions_created_idx" ON "bot_actions" USING btree ("created_at");
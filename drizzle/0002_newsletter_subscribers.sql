CREATE TYPE "public"."newsletter_status" AS ENUM('pending', 'confirmed', 'unsubscribed');--> statement-breakpoint
CREATE TABLE "newsletter_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"status" "newsletter_status" DEFAULT 'pending' NOT NULL,
	"zip" text,
	"source" text NOT NULL,
	"source_path" text,
	"market_slug" text,
	"confirm_token_hash" text,
	"confirm_expires_at" timestamp with time zone,
	"confirm_sent_at" timestamp with time zone,
	"unsubscribe_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	CONSTRAINT "newsletter_subscribers_email_unique" UNIQUE("email"),
	CONSTRAINT "newsletter_subscribers_unsubscribe_token_unique" UNIQUE("unsubscribe_token")
);
--> statement-breakpoint
CREATE INDEX "newsletter_status_idx" ON "newsletter_subscribers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "newsletter_confirm_token_idx" ON "newsletter_subscribers" USING btree ("confirm_token_hash");
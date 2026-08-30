CREATE TYPE "public"."submission_status" AS ENUM('pending', 'reviewed', 'applied', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."submission_type" AS ENUM('correction', 'new_market', 'claim', 'contact');--> statement-breakpoint
CREATE TABLE "market_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" text NOT NULL,
	"field" text NOT NULL,
	"value" jsonb NOT NULL,
	"source_url" text,
	"source_title" text,
	"verified_at" text,
	"batch" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"state" text,
	"country" text,
	"country_code" text,
	"latitude" double precision,
	"longitude" double precision,
	"record" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "submission_type" NOT NULL,
	"market_id" text,
	"payload" jsonb NOT NULL,
	"email" text,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"review_note" text
);
--> statement-breakpoint
ALTER TABLE "market_facts" ADD CONSTRAINT "market_facts_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "market_facts_market_idx" ON "market_facts" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "market_facts_field_idx" ON "market_facts" USING btree ("field");--> statement-breakpoint
CREATE INDEX "markets_slug_idx" ON "markets" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "markets_state_idx" ON "markets" USING btree ("state");--> statement-breakpoint
CREATE INDEX "submissions_status_idx" ON "submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "submissions_market_idx" ON "submissions" USING btree ("market_id");
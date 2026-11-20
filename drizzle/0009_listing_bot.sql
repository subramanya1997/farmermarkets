CREATE TABLE "bot_markets" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"state" text,
	"record" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"source_note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_redirects" (
	"from_slug" text PRIMARY KEY NOT NULL,
	"to_slug" text NOT NULL,
	"from_market_id" text,
	"to_market_id" text,
	"approved_by" text NOT NULL,
	"created_by" text NOT NULL,
	"source_note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_photos" ADD COLUMN "credit" text;--> statement-breakpoint
ALTER TABLE "market_photos" ADD COLUMN "source_note" text;--> statement-breakpoint
ALTER TABLE "market_photos" ADD COLUMN "content_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "bot_markets_slug_idx" ON "bot_markets" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "market_redirects_to_idx" ON "market_redirects" USING btree ("to_slug");--> statement-breakpoint
CREATE INDEX "market_photos_hash_idx" ON "market_photos" USING btree ("market_id","content_hash");
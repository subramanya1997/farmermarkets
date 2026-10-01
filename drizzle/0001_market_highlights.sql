CREATE TABLE "market_events" (
	"market_id" text NOT NULL,
	"item_id" text NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"provenance" jsonb NOT NULL,
	"verified_at" date NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"source_start" text,
	"source_end" text,
	"start_precision" text NOT NULL,
	"end_precision" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"url" text,
	CONSTRAINT "market_events_market_id_item_id_pk" PRIMARY KEY("market_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "market_programs" (
	"market_id" text NOT NULL,
	"item_id" text NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"provenance" jsonb NOT NULL,
	"verified_at" date NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"eligibility" text,
	"url" text,
	CONSTRAINT "market_programs_market_id_item_id_pk" PRIMARY KEY("market_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "market_vendors" (
	"market_id" text NOT NULL,
	"item_id" text NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"provenance" jsonb NOT NULL,
	"verified_at" date NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"website" text,
	"social_url" text,
	"categories" jsonb NOT NULL,
	"seasonal" boolean,
	CONSTRAINT "market_vendors_market_id_item_id_pk" PRIMARY KEY("market_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "market_events" ADD CONSTRAINT "market_events_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_programs" ADD CONSTRAINT "market_programs_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_vendors" ADD CONSTRAINT "market_vendors_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "market_events_date_idx" ON "market_events" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "market_events_timestamp_idx" ON "market_events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "market_events_kind_idx" ON "market_events" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "market_programs_kind_idx" ON "market_programs" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "market_vendors_name_idx" ON "market_vendors" USING btree ("name");
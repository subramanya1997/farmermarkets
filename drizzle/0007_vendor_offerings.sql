CREATE TABLE "vendor_offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"market_id" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "vendor_offerings" ADD CONSTRAINT "vendor_offerings_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_offerings_vendor_market_days_idx" ON "vendor_offerings" USING btree ("vendor_id","market_id","starts_on","ends_on");--> statement-breakpoint
CREATE INDEX "vendor_offerings_market_idx" ON "vendor_offerings" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "vendor_offerings_ends_on_idx" ON "vendor_offerings" USING btree ("ends_on");
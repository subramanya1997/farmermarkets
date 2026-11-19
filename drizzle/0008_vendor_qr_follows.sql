CREATE TABLE "vendor_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"source" text DEFAULT 'qr' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_qr_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"market_id" text,
	"visitor_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vendor_follows" ADD CONSTRAINT "vendor_follows_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_follows" ADD CONSTRAINT "vendor_follows_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_qr_scans" ADD CONSTRAINT "vendor_qr_scans_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_follows_vendor_user_idx" ON "vendor_follows" USING btree ("vendor_id","user_id");--> statement-breakpoint
CREATE INDEX "vendor_follows_user_idx" ON "vendor_follows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vendor_qr_scans_vendor_created_idx" ON "vendor_qr_scans" USING btree ("vendor_id","created_at");--> statement-breakpoint
CREATE INDEX "vendor_qr_scans_visitor_created_idx" ON "vendor_qr_scans" USING btree ("visitor_hash","created_at");
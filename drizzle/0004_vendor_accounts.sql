CREATE TYPE "public"."vendor_application_status" AS ENUM('pending', 'approved', 'denied', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."vendor_status" AS ENUM('draft', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "market_vendor_checklists" (
	"market_id" text PRIMARY KEY NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "vendor_announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"audience" text NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"sent_by" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"market_id" text NOT NULL,
	"days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stall_note" text,
	"message" text,
	"status" "vendor_application_status" DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_role" text,
	"decision_note" text,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vendor_document_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"requirement_key" text NOT NULL,
	"document_id" uuid NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"note" text,
	"decided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vendor_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"label" text NOT NULL,
	"pathname" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"expires_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"profile" jsonb,
	"proposed" jsonb,
	"status" "vendor_status" DEFAULT 'draft' NOT NULL,
	"review_note" text,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"source" text DEFAULT 'self' NOT NULL,
	"invited_markets" jsonb,
	"suspended_at" timestamp with time zone,
	"announcements_opt_out" boolean DEFAULT false NOT NULL,
	"unsubscribe_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_applications_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_document_submissions" ADD CONSTRAINT "vendor_document_submissions_application_id_vendor_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."vendor_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_document_submissions" ADD CONSTRAINT "vendor_document_submissions_document_id_vendor_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."vendor_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_applications_vendor_market_idx" ON "vendor_applications" USING btree ("vendor_id","market_id");--> statement-breakpoint
CREATE INDEX "vendor_applications_market_idx" ON "vendor_applications" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "vendor_applications_status_idx" ON "vendor_applications" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_document_submissions_item_idx" ON "vendor_document_submissions" USING btree ("application_id","requirement_key");--> statement-breakpoint
CREATE INDEX "vendor_document_submissions_document_idx" ON "vendor_document_submissions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "vendor_documents_vendor_idx" ON "vendor_documents" USING btree ("vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_documents_pathname_idx" ON "vendor_documents" USING btree ("pathname");--> statement-breakpoint
CREATE UNIQUE INDEX "vendors_user_idx" ON "vendors" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendors_slug_idx" ON "vendors" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "vendors_unsubscribe_token_idx" ON "vendors" USING btree ("unsubscribe_token");--> statement-breakpoint
CREATE INDEX "vendors_status_idx" ON "vendors" USING btree ("status");
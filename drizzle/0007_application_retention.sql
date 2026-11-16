ALTER TYPE "public"."application_status" ADD VALUE 'closed';--> statement-breakpoint
CREATE TABLE "application_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"last_name" text,
	"first_names" text,
	"membership_type_name" text,
	"outcome" "application_status" NOT NULL,
	"reason" text,
	"received_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decided_by_name" text,
	"closed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retain_until" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "closure_warned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "closed_from_status" "application_status";--> statement-breakpoint
CREATE UNIQUE INDEX "application_records_reference_uq" ON "application_records" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "application_records_retain_idx" ON "application_records" USING btree ("retain_until");
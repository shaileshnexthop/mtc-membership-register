ALTER TYPE "public"."payment_method" ADD VALUE 'card' BEFORE 'bank_transfer';--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "gateway_checkout_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "gateway_transaction_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_gateway_checkout_uq" ON "payments" USING btree ("gateway_checkout_id");--> statement-breakpoint
-- Decision 6 Oct 2026: approved applicants pay within 3 business days (was 5).
UPDATE "settings" SET "value" = '3'::jsonb, "updated_at" = now() WHERE "key" = 'payment_deadline_business_days';

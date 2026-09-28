CREATE TYPE "public"."payment_method" AS ENUM('mips', 'bank_transfer', 'cash', 'cheque');--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "mips_order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "method" "payment_method" DEFAULT 'mips' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "recorded_by_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_staff_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;
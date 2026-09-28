ALTER TABLE "application_sponsors" ADD COLUMN "confirmation_method" text;--> statement-breakpoint
ALTER TABLE "application_sponsors" ADD COLUMN "confirmed_by_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "application_sponsors" ADD COLUMN "confirmation_note" text;--> statement-breakpoint
ALTER TABLE "application_sponsors" ADD CONSTRAINT "application_sponsors_confirmed_by_staff_id_staff_users_id_fk" FOREIGN KEY ("confirmed_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;
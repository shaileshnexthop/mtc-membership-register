-- Decision 16 Oct 2026: joining payments go to MTC's MCB account.
UPDATE "settings" SET "value" = '"The Mauritius Commercial Bank"'::jsonb, "updated_at" = now() WHERE "key" = 'payment_bank_name';--> statement-breakpoint
UPDATE "settings" SET "value" = '"000010053468"'::jsonb, "updated_at" = now() WHERE "key" = 'payment_bank_account';--> statement-breakpoint
INSERT INTO "settings" ("key", "value") VALUES ('payment_bank_holder', '"Mauritius Turf Club"'::jsonb) ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updated_at" = now();
--> statement-breakpoint
-- With a 3-business-day deadline, joining-fee reminders go out on business days 2 and 3.
UPDATE "settings" SET "value" = '[2, 3]'::jsonb, "updated_at" = now() WHERE "key" = 'payment_reminder_business_days';

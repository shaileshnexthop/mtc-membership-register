CREATE TYPE "public"."actor_type" AS ENUM('system', 'applicant', 'member', 'staff');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('draft', 'submitted', 'deferred', 'rejected', 'approved', 'admitted');--> statement-breakpoint
CREATE TYPE "public"."compliance_status" AS ENUM('pending', 'cleared', 'not_cleared');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('id_document', 'proof_of_address', 'certificate_of_character', 'photo', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_review_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('queued', 'sent', 'delivered', 'bounced', 'failed');--> statement-breakpoint
CREATE TYPE "public"."fee_period" AS ENUM('monthly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('active', 'renewal_due', 'lapsed', 'resigned');--> statement-breakpoint
CREATE TYPE "public"."payment_purpose" AS ENUM('joining', 'dues', 'renewal', 'upgrade_adjustment');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'failed', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('reviewer', 'compliance_officer', 'approver', 'finance', 'administrator');--> statement-breakpoint
CREATE TYPE "public"."token_purpose" AS ENUM('email_verification', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."upgrade_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE SEQUENCE "public"."application_ref_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."member_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 10000 CACHE 1;--> statement-breakpoint
CREATE TABLE "account_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"purpose" "token_purpose" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"mobile_phone" text,
	"email_verified_at" timestamp with time zone,
	"failed_logins" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"application_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"staff_user_id" uuid,
	"account_id" uuid,
	"event_type" text NOT NULL,
	"subject" text,
	"comment" text,
	"internal" boolean DEFAULT false NOT NULL,
	"from_status" "application_status",
	"to_status" "application_status"
);
--> statement-breakpoint
CREATE TABLE "application_sponsors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"last_name" text NOT NULL,
	"first_names" text NOT NULL,
	"phone" text,
	"email" text NOT NULL,
	"matched_member_id" uuid,
	"confirm_token_hash" text,
	"requested_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"last_reminder_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"account_id" uuid NOT NULL,
	"membership_type_id" uuid,
	"status" "application_status" DEFAULT 'draft' NOT NULL,
	"last_name" text,
	"first_names" text,
	"date_of_birth" date,
	"nationality" text,
	"id_number" text,
	"residential_address" text,
	"mobile_phone" text,
	"home_phone" text,
	"profession" text,
	"employer_name" text,
	"work_address" text,
	"declaration_accepted_at" timestamp with time zone,
	"data_protection_ack_at" timestamp with time zone,
	"aml_ack_at" timestamp with time zone,
	"signature_name" text,
	"signature_place" text,
	"signed_at" timestamp with time zone,
	"signature_ip" "inet",
	"signature_user_agent" text,
	"received_at" timestamp with time zone,
	"last_submitted_at" timestamp with time zone,
	"submission_count" smallint DEFAULT 0 NOT NULL,
	"compliance_status" "compliance_status" DEFAULT 'pending' NOT NULL,
	"compliance_officer_id" uuid,
	"compliance_reviewed_at" timestamp with time zone,
	"compliance_comment" text,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_comment" text,
	"payment_due_at" timestamp with time zone,
	"admitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"staff_user_id" uuid,
	"account_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"ip" "inet",
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid,
	"member_id" uuid,
	"kind" "document_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"document_date" date,
	"expires_on" date,
	"uploaded_by_account_id" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"review_status" "document_review_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_comment" text,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_email" text NOT NULL,
	"template_key" text NOT NULL,
	"subject" text NOT NULL,
	"application_id" uuid,
	"member_id" uuid,
	"staff_user_id" uuid,
	"provider_message_id" text,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"key" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_staff_id" uuid
);
--> statement-breakpoint
CREATE TABLE "member_detail_changes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"member_id" uuid NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_by_type" "actor_type" NOT NULL,
	"changed_by_staff_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"member_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"actor_type" "actor_type" NOT NULL,
	"staff_user_id" uuid,
	"data" jsonb
);
--> statement-breakpoint
CREATE TABLE "member_type_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"membership_type_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"fee_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_number" text NOT NULL,
	"account_id" uuid,
	"application_id" uuid,
	"membership_type_id" uuid NOT NULL,
	"status" "member_status" DEFAULT 'active' NOT NULL,
	"last_name" text NOT NULL,
	"first_names" text NOT NULL,
	"email" text NOT NULL,
	"mobile_phone" text,
	"home_phone" text,
	"residential_address" text,
	"date_of_birth" date,
	"nationality" text,
	"id_number" text,
	"id_expires_on" date,
	"profession" text,
	"employer_name" text,
	"member_since" date NOT NULL,
	"continuous_since" date NOT NULL,
	"current_fee_cents" integer NOT NULL,
	"next_due_on" date,
	"expires_on" date,
	"imported_from_register" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"fee_cents" integer NOT NULL,
	"fee_period" "fee_period" DEFAULT 'monthly' NOT NULL,
	"conditions_text" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid,
	"member_id" uuid,
	"purpose" "payment_purpose" NOT NULL,
	"period_start" date,
	"period_end" date,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'MUR' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"mips_order_id" text NOT NULL,
	"mips_reference" text,
	"failure_reason" text,
	"callback_verified_at" timestamp with time zone,
	"raw_callback" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "public_holidays" (
	"day" date PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" uuid,
	"staff_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_staff_id" uuid
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entra_object_id" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"roles" "staff_role"[] DEFAULT '{}' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upgrade_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"from_type_id" uuid NOT NULL,
	"to_type_id" uuid NOT NULL,
	"effective_date" date NOT NULL,
	"reason" text NOT NULL,
	"fee_before_cents" integer NOT NULL,
	"fee_after_cents" integer NOT NULL,
	"status" "upgrade_status" DEFAULT 'pending' NOT NULL,
	"requested_by_id" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_comment" text,
	"last_reminder_at" timestamp with time zone,
	"member_notified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_sponsors" ADD CONSTRAINT "application_sponsors_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_sponsors" ADD CONSTRAINT "application_sponsors_matched_member_id_members_id_fk" FOREIGN KEY ("matched_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_membership_type_id_membership_types_id_fk" FOREIGN KEY ("membership_type_id") REFERENCES "public"."membership_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_compliance_officer_id_staff_users_id_fk" FOREIGN KEY ("compliance_officer_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_decided_by_id_staff_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_account_id_accounts_id_fk" FOREIGN KEY ("uploaded_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_reviewed_by_id_staff_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_updated_by_staff_id_staff_users_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_detail_changes" ADD CONSTRAINT "member_detail_changes_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_detail_changes" ADD CONSTRAINT "member_detail_changes_changed_by_staff_id_staff_users_id_fk" FOREIGN KEY ("changed_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_events" ADD CONSTRAINT "member_events_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_events" ADD CONSTRAINT "member_events_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_type_periods" ADD CONSTRAINT "member_type_periods_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_type_periods" ADD CONSTRAINT "member_type_periods_membership_type_id_membership_types_id_fk" FOREIGN KEY ("membership_type_id") REFERENCES "public"."membership_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_membership_type_id_membership_types_id_fk" FOREIGN KEY ("membership_type_id") REFERENCES "public"."membership_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_staff_id_staff_users_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upgrade_requests" ADD CONSTRAINT "upgrade_requests_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upgrade_requests" ADD CONSTRAINT "upgrade_requests_from_type_id_membership_types_id_fk" FOREIGN KEY ("from_type_id") REFERENCES "public"."membership_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upgrade_requests" ADD CONSTRAINT "upgrade_requests_to_type_id_membership_types_id_fk" FOREIGN KEY ("to_type_id") REFERENCES "public"."membership_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upgrade_requests" ADD CONSTRAINT "upgrade_requests_requested_by_id_staff_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upgrade_requests" ADD CONSTRAINT "upgrade_requests_decided_by_id_staff_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_tokens_hash_uq" ON "account_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_email_uq" ON "accounts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "application_events_app_idx" ON "application_events" USING btree ("application_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "application_sponsors_position_uq" ON "application_sponsors" USING btree ("application_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_reference_uq" ON "applications" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "applications_status_idx" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "applications_account_idx" ON "applications" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_one_open_per_account_uq" ON "applications" USING btree ("account_id") WHERE "applications"."status" in ('draft', 'submitted', 'deferred', 'approved');--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "documents_application_idx" ON "documents" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "documents_member_idx" ON "documents" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "email_log_member_idx" ON "email_log" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "email_log_application_idx" ON "email_log" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "member_detail_changes_member_idx" ON "member_detail_changes" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "member_events_member_idx" ON "member_events" USING btree ("member_id","at");--> statement-breakpoint
CREATE INDEX "member_type_periods_member_idx" ON "member_type_periods" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_number_uq" ON "members" USING btree ("member_number");--> statement-breakpoint
CREATE UNIQUE INDEX "members_account_uq" ON "members" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "members_status_idx" ON "members" USING btree ("status");--> statement-breakpoint
CREATE INDEX "members_type_idx" ON "members" USING btree ("membership_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_types_code_uq" ON "membership_types" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_mips_order_uq" ON "payments" USING btree ("mips_order_id");--> statement-breakpoint
CREATE INDEX "payments_member_idx" ON "payments" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "payments_application_idx" ON "payments" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_users_oid_uq" ON "staff_users" USING btree ("entra_object_id");--> statement-breakpoint
CREATE INDEX "upgrade_requests_status_idx" ON "upgrade_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "upgrade_requests_member_idx" ON "upgrade_requests" USING btree ("member_id");
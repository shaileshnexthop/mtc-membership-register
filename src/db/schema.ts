/**
 * Database schema for the MTC Membership Register.
 *
 * Requirement IDs (REG-, APP-, KYC-, REV-, UPG-, PAY-, REN-, MEM-, RPT-, ADM-)
 * refer to the functional specification shared with MTC.
 *
 * Conventions
 * - Money is stored as integer cents in MUR (`*_cents`).
 * - History is never overwritten: status changes, journey entries, detail
 *   changes and type changes are appended as rows (MEM-03, MEM-10).
 * - KYC files live in private object storage; only their keys are stored here.
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  index,
  inet,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const tokenPurpose = pgEnum("token_purpose", [
  "email_verification",
  "password_reset",
]);

export const staffRole = pgEnum("staff_role", [
  "reviewer",
  "compliance_officer",
  "approver",
  "finance",
  "administrator",
]);

export const feePeriod = pgEnum("fee_period", ["monthly", "annual"]);

export const applicationStatus = pgEnum("application_status", [
  "draft",
  "submitted",
  "deferred",
  "rejected",
  "approved", // awaiting MIPS payment
  "admitted", // paid; member record created
]);

export const complianceStatus = pgEnum("compliance_status", [
  "pending",
  "cleared",
  "not_cleared",
]);

export const documentKind = pgEnum("document_kind", [
  "id_document", // (a) CNI or passport
  "proof_of_address", // (b) < 3 months
  "certificate_of_character", // (c) < 6 months
  "photo", // (d) passport format
  "other", // (e) on request of the Club
]);

export const documentReviewStatus = pgEnum("document_review_status", [
  "pending",
  "verified",
  "rejected",
]);

export const memberStatus = pgEnum("member_status", [
  "active",
  "renewal_due",
  "lapsed",
  "resigned",
]);

export const upgradeStatus = pgEnum("upgrade_status", [
  "pending",
  "approved",
  "rejected",
]);

export const paymentPurpose = pgEnum("payment_purpose", [
  "joining",
  "dues",
  "renewal",
  "upgrade_adjustment",
]);

export const paymentStatus = pgEnum("payment_status", [
  "pending",
  "paid",
  "failed",
  "cancelled",
  "refunded",
]);

export const emailStatus = pgEnum("email_status", [
  "queued",
  "sent",
  "delivered",
  "bounced",
  "failed",
]);

export const actorType = pgEnum("actor_type", [
  "system",
  "applicant",
  "member",
  "staff",
]);

/* ------------------------------------------------------------------ */
/* Sequences for human-readable numbers                                */
/* ------------------------------------------------------------------ */

/** APP-<year>-<nnnn> */
export const applicationRefSeq = pgSequence("application_ref_seq", {
  startWith: 1,
});

/** MTC-<nnnnnn>. Starts high so imported member numbers keep theirs. */
export const memberNumberSeq = pgSequence("member_number_seq", {
  startWith: 10000,
});

/* ------------------------------------------------------------------ */
/* Accounts, staff and sessions                                        */
/* ------------------------------------------------------------------ */

/** Applicant / member portal accounts (REG-01 … REG-06). */
export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    email: text("email").notNull(), // stored lower-case
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    mobilePhone: text("mobile_phone"),
    emailVerifiedAt: ts("email_verified_at"),
    failedLogins: smallint("failed_logins").notNull().default(0),
    lockedUntil: ts("locked_until"),
    lastLoginAt: ts("last_login_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("accounts_email_uq").on(t.email)],
);

/** One-time tokens for email verification and password reset. Only hashes are stored. */
export const accountTokens = pgTable(
  "account_tokens",
  {
    id: id(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    purpose: tokenPurpose("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("account_tokens_hash_uq").on(t.tokenHash)],
);

/** MTC staff, signed in through MTC's Microsoft 365 (Entra ID) tenant. */
export const staffUsers = pgTable(
  "staff_users",
  {
    id: id(),
    entraObjectId: text("entra_object_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    /** Refreshed from the token's app roles at each sign-in. */
    roles: staffRole("roles").array().notNull().default(sql`'{}'`),
    lastLoginAt: ts("last_login_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("staff_users_oid_uq").on(t.entraObjectId)],
);

/** Server-side sessions for both portal accounts and staff. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // SHA-256 of the cookie value
    accountId: uuid("account_id").references(() => accounts.id, {
      onDelete: "cascade",
    }),
    staffUserId: uuid("staff_user_id").references(() => staffUsers.id, {
      onDelete: "cascade",
    }),
    expiresAt: ts("expires_at").notNull(),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_expires_idx").on(t.expiresAt)],
);

/* ------------------------------------------------------------------ */
/* Reference data and settings                                         */
/* ------------------------------------------------------------------ */

/** Membership types and their fees (ADM-01). */
export const membershipTypes = pgTable(
  "membership_types",
  {
    id: id(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    feeCents: integer("fee_cents").notNull(),
    feePeriod: feePeriod("fee_period").notNull().default("monthly"),
    conditionsText: text("conditions_text"),
    active: boolean("active").notNull().default(true),
    sortOrder: smallint("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("membership_types_code_uq").on(t.code)],
);

/** Mauritius public holidays used for business-day deadlines (ADM-02). */
export const publicHolidays = pgTable("public_holidays", {
  day: date("day").primaryKey(),
  name: text("name").notNull(),
});

/** Key/value settings, e.g. payment deadline days and reminder intervals (ADM-03). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  updatedByStaffId: uuid("updated_by_staff_id").references(() => staffUsers.id),
});

/** Editable email templates (NOT-02). */
export const emailTemplates = pgTable("email_templates", {
  key: text("key").primaryKey(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  updatedByStaffId: uuid("updated_by_staff_id").references(() => staffUsers.id),
});

/* ------------------------------------------------------------------ */
/* Applications                                                         */
/* ------------------------------------------------------------------ */

/** The online version of the "Formulaire de candidature" (APP-03). */
export const applications = pgTable(
  "applications",
  {
    id: id(),
    reference: text("reference").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    membershipTypeId: uuid("membership_type_id").references(
      () => membershipTypes.id,
    ),
    status: applicationStatus("status").notNull().default("draft"),

    // I. Informations personnelles
    lastName: text("last_name"),
    firstNames: text("first_names"),
    dateOfBirth: date("date_of_birth"),
    nationality: text("nationality"),
    idNumber: text("id_number"),
    residentialAddress: text("residential_address"),
    mobilePhone: text("mobile_phone"),
    homePhone: text("home_phone"),

    // II. Emploi / Activité professionnelle
    profession: text("profession"),
    employerName: text("employer_name"),
    workAddress: text("work_address"),

    // IV–VII. Declarations and electronic signature (APP-06)
    declarationAcceptedAt: ts("declaration_accepted_at"),
    dataProtectionAckAt: ts("data_protection_ack_at"),
    amlAckAt: ts("aml_ack_at"),
    signatureName: text("signature_name"),
    signaturePlace: text("signature_place"),
    signedAt: ts("signed_at"),
    signatureIp: inet("signature_ip"),
    signatureUserAgent: text("signature_user_agent"),

    // Partie réservée à l'administration du Club (REV-06)
    receivedAt: ts("received_at"), // Date de réception du dossier (first submission)
    lastSubmittedAt: ts("last_submitted_at"),
    submissionCount: smallint("submission_count").notNull().default(0),
    complianceStatus: complianceStatus("compliance_status")
      .notNull()
      .default("pending"),
    complianceOfficerId: uuid("compliance_officer_id").references(
      () => staffUsers.id,
    ),
    complianceReviewedAt: ts("compliance_reviewed_at"),
    complianceComment: text("compliance_comment"),

    // Decision (REV-02) and payment window (PAY-02)
    decidedById: uuid("decided_by_id").references(() => staffUsers.id),
    decidedAt: ts("decided_at"),
    decisionComment: text("decision_comment"),
    paymentDueAt: ts("payment_due_at"),
    admittedAt: ts("admitted_at"), // Admis comme Membre le

    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("applications_reference_uq").on(t.reference),
    index("applications_status_idx").on(t.status),
    index("applications_account_idx").on(t.accountId),
    // APP-08: one open application per account
    uniqueIndex("applications_one_open_per_account_uq")
      .on(t.accountId)
      .where(sql`${t.status} in ('draft', 'submitted', 'deferred', 'approved')`),
  ],
);

/** III. Parrainage — up to three sponsors, each confirming by email (APP-07). */
export const applicationSponsors = pgTable(
  "application_sponsors",
  {
    id: id(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(), // 1–3 as on the paper form
    lastName: text("last_name").notNull(),
    firstNames: text("first_names").notNull(),
    phone: text("phone"),
    email: text("email").notNull(),
    matchedMemberId: uuid("matched_member_id").references(() => members.id),
    confirmTokenHash: text("confirm_token_hash"),
    requestedAt: ts("requested_at"),
    confirmedAt: ts("confirmed_at"),
    declinedAt: ts("declined_at"),
    lastReminderAt: ts("last_reminder_at"),
  },
  (t) => [
    uniqueIndex("application_sponsors_position_uq").on(
      t.applicationId,
      t.position,
    ),
  ],
);

/** Uploaded KYC and supporting documents (APP-04, KYC-01 … KYC-10). */
export const documents = pgTable(
  "documents",
  {
    id: id(),
    applicationId: uuid("application_id").references(() => applications.id),
    memberId: uuid("member_id").references(() => members.id),
    kind: documentKind("kind").notNull(),
    storageKey: text("storage_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    documentDate: date("document_date"), // date printed on the document, if any
    expiresOn: date("expires_on"), // ID expiry, for KYC-09
    uploadedByAccountId: uuid("uploaded_by_account_id").references(
      () => accounts.id,
    ),
    uploadedAt: ts("uploaded_at").notNull().defaultNow(),
    reviewStatus: documentReviewStatus("review_status")
      .notNull()
      .default("pending"),
    reviewedById: uuid("reviewed_by_id").references(() => staffUsers.id),
    reviewedAt: ts("reviewed_at"),
    reviewComment: text("review_comment"),
    supersededAt: ts("superseded_at"), // replaced by a newer upload
  },
  (t) => [
    index("documents_application_idx").on(t.applicationId),
    index("documents_member_idx").on(t.memberId),
  ],
);

/** Status history and the "Date / Sujet / Commentaires" log (REV-05, REV-06). */
export const applicationEvents = pgTable(
  "application_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    at: ts("at").notNull().defaultNow(),
    actorType: actorType("actor_type").notNull(),
    staffUserId: uuid("staff_user_id").references(() => staffUsers.id),
    accountId: uuid("account_id").references(() => accounts.id),
    eventType: text("event_type").notNull(), // e.g. submitted, deferred, kyc_verified, note
    subject: text("subject"),
    comment: text("comment"),
    internal: boolean("internal").notNull().default(false), // hidden from applicant (REV-03)
    fromStatus: applicationStatus("from_status"),
    toStatus: applicationStatus("to_status"),
  },
  (t) => [index("application_events_app_idx").on(t.applicationId, t.at)],
);

/* ------------------------------------------------------------------ */
/* Members                                                              */
/* ------------------------------------------------------------------ */

/** The permanent member record (MEM-01, MEM-02). */
export const members = pgTable(
  "members",
  {
    id: id(),
    memberNumber: text("member_number").notNull(),
    accountId: uuid("account_id").references(() => accounts.id),
    applicationId: uuid("application_id"),
    membershipTypeId: uuid("membership_type_id")
      .notNull()
      .references(() => membershipTypes.id),
    status: memberStatus("status").notNull().default("active"),

    lastName: text("last_name").notNull(),
    firstNames: text("first_names").notNull(),
    email: text("email").notNull(),
    mobilePhone: text("mobile_phone"),
    homePhone: text("home_phone"),
    residentialAddress: text("residential_address"),
    dateOfBirth: date("date_of_birth"),
    nationality: text("nationality"),
    idNumber: text("id_number"),
    idExpiresOn: date("id_expires_on"),
    profession: text("profession"),
    employerName: text("employer_name"),

    memberSince: date("member_since").notNull(), // first admission (MEM-04 total years)
    continuousSince: date("continuous_since").notNull(), // last reinstatement (MEM-04 continuous years)
    currentFeeCents: integer("current_fee_cents").notNull(),
    nextDueOn: date("next_due_on"),
    expiresOn: date("expires_on"),
    importedFromRegister: boolean("imported_from_register")
      .notNull()
      .default(false),

    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("members_number_uq").on(t.memberNumber),
    uniqueIndex("members_account_uq").on(t.accountId),
    index("members_status_idx").on(t.status),
    index("members_type_idx").on(t.membershipTypeId),
  ],
);

/** Journey timeline entries (MEM-03). */
export const memberEvents = pgTable(
  "member_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    at: ts("at").notNull().defaultNow(),
    eventType: text("event_type").notNull(), // admitted, payment, upgrade, lapsed, reinstated, kyc_refresh …
    title: text("title").notNull(),
    detail: text("detail"),
    actorType: actorType("actor_type").notNull(),
    staffUserId: uuid("staff_user_id").references(() => staffUsers.id),
    data: jsonb("data"),
  },
  (t) => [index("member_events_member_idx").on(t.memberId, t.at)],
);

/** Periods in each membership type, for tenure by type and the upgrade path (MEM-04, MEM-05). */
export const memberTypePeriods = pgTable(
  "member_type_periods",
  {
    id: id(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    membershipTypeId: uuid("membership_type_id")
      .notNull()
      .references(() => membershipTypes.id),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"), // null = current
    feeCents: integer("fee_cents").notNull(),
  },
  (t) => [index("member_type_periods_member_idx").on(t.memberId)],
);

/** Old/new values of personal details (MEM-10). */
export const memberDetailChanges = pgTable(
  "member_detail_changes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    changedByType: actorType("changed_by_type").notNull(),
    changedByStaffId: uuid("changed_by_staff_id").references(
      () => staffUsers.id,
    ),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("member_detail_changes_member_idx").on(t.memberId)],
);

/** Staff-raised upgrades with a second-person approval (UPG-01 … UPG-08). */
export const upgradeRequests = pgTable(
  "upgrade_requests",
  {
    id: id(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    fromTypeId: uuid("from_type_id")
      .notNull()
      .references(() => membershipTypes.id),
    toTypeId: uuid("to_type_id")
      .notNull()
      .references(() => membershipTypes.id),
    effectiveDate: date("effective_date").notNull(),
    reason: text("reason").notNull(),
    feeBeforeCents: integer("fee_before_cents").notNull(),
    feeAfterCents: integer("fee_after_cents").notNull(),
    status: upgradeStatus("status").notNull().default("pending"),
    requestedById: uuid("requested_by_id")
      .notNull()
      .references(() => staffUsers.id),
    requestedAt: ts("requested_at").notNull().defaultNow(),
    decidedById: uuid("decided_by_id").references(() => staffUsers.id),
    decidedAt: ts("decided_at"),
    decisionComment: text("decision_comment"),
    lastReminderAt: ts("last_reminder_at"),
    memberNotifiedAt: ts("member_notified_at"),
  },
  (t) => [
    index("upgrade_requests_status_idx").on(t.status),
    index("upgrade_requests_member_idx").on(t.memberId),
  ],
);

/* ------------------------------------------------------------------ */
/* Payments                                                             */
/* ------------------------------------------------------------------ */

/** MIPS payments. No card data is ever stored (security requirement). */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    applicationId: uuid("application_id").references(() => applications.id),
    memberId: uuid("member_id").references(() => members.id),
    purpose: paymentPurpose("purpose").notNull(),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("MUR"),
    status: paymentStatus("status").notNull().default("pending"),
    mipsOrderId: text("mips_order_id").notNull(),
    mipsReference: text("mips_reference"),
    failureReason: text("failure_reason"),
    callbackVerifiedAt: ts("callback_verified_at"),
    rawCallback: jsonb("raw_callback"),
    createdAt: createdAt(),
    paidAt: ts("paid_at"),
  },
  (t) => [
    uniqueIndex("payments_mips_order_uq").on(t.mipsOrderId),
    index("payments_member_idx").on(t.memberId),
    index("payments_application_idx").on(t.applicationId),
    index("payments_status_idx").on(t.status),
  ],
);

/* ------------------------------------------------------------------ */
/* Email and audit                                                      */
/* ------------------------------------------------------------------ */

/** Every email sent through SMTP2GO (NOT-04, MEM-08). */
export const emailLog = pgTable(
  "email_log",
  {
    id: id(),
    toEmail: text("to_email").notNull(),
    templateKey: text("template_key").notNull(),
    subject: text("subject").notNull(),
    applicationId: uuid("application_id").references(() => applications.id),
    memberId: uuid("member_id").references(() => members.id),
    staffUserId: uuid("staff_user_id").references(() => staffUsers.id),
    providerMessageId: text("provider_message_id"),
    status: emailStatus("status").notNull().default("queued"),
    error: text("error"),
    createdAt: createdAt(),
    sentAt: ts("sent_at"),
  },
  (t) => [
    index("email_log_member_idx").on(t.memberId),
    index("email_log_application_idx").on(t.applicationId),
  ],
);

/** Append-only audit log of staff actions and status changes (ADM-05, RPT-08). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: ts("at").notNull().defaultNow(),
    actorType: actorType("actor_type").notNull(),
    staffUserId: uuid("staff_user_id").references(() => staffUsers.id),
    accountId: uuid("account_id").references(() => accounts.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    ip: inet("ip"),
    details: jsonb("details"),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_at_idx").on(t.at),
  ],
);

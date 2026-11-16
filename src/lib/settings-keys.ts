/** Settings the Administrator edits on Settings → Payments & renewals (ADM-03). */
export const PAYMENT_SETTING_KEYS = [
  "payment_deadline_business_days",
  "payment_reminder_business_days",
  "upgrade_reminder_business_days",
  "renewal_reminder_days_before",
  "renewal_grace_days",
  "payment_bank_name",
  "payment_bank_holder",
  "payment_bank_account",
] as const;

/** Settings the Administrator edits on Settings → Data retention (ADM-06). */
export const RETENTION_SETTING_KEYS = [
  "application_close_after_days",
  "application_close_warning_days",
  "application_delete_after_days",
  "application_record_retention_months",
] as const;

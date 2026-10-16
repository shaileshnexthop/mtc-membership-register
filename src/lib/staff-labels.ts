/** English status labels and pill styles for staff pages. */
export const STATUS_EN: Record<string, [string, "pillIdle" | "pillInfo" | "pillWarn" | "pillBad" | "pillOk"]> = {
  draft: ["Draft", "pillIdle"],
  submitted: ["In review", "pillInfo"],
  deferred: ["Deferred", "pillWarn"],
  rejected: ["Rejected", "pillBad"],
  approved: ["Approved · awaiting payment", "pillOk"],
  admitted: ["Admitted", "pillOk"],
};

/** KYC document kinds, in English for staff pages. */
export const DOC_EN: Record<string, string> = {
  id_document: "National Identity Card or passport",
  proof_of_address: "Proof of address (under 3 months)",
  certificate_of_character: "Certificate of Character (under 6 months)",
  photo: "Passport-format photograph",
  other: "Other document requested by the Club",
};

/** English status labels and pill styles for staff pages. */
export const STATUS_EN: Record<string, [string, "pillIdle" | "pillInfo" | "pillWarn" | "pillBad" | "pillOk"]> = {
  draft: ["Draft", "pillIdle"],
  submitted: ["In review", "pillInfo"],
  deferred: ["Deferred", "pillWarn"],
  rejected: ["Rejected", "pillBad"],
  approved: ["Approved · awaiting payment", "pillOk"],
  admitted: ["Admitted", "pillOk"],
};

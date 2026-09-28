import "server-only";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "./session";
import type { StaffRole } from "./entra";

export type Staff = NonNullable<Awaited<ReturnType<typeof getCurrentStaff>>>;

export const ROLE_LABELS: Record<StaffRole, string> = {
  reviewer: "Reviewer",
  compliance_officer: "Compliance Officer",
  approver: "Approver",
  finance: "Finance",
  administrator: "Administrator",
};

export function hasRole(staff: Staff, ...roles: StaffRole[]): boolean {
  return staff.roles.some((r) => roles.includes(r));
}

/** For staff pages: signed-in staff with one of the roles, else back to staff sign-in. */
export async function requireStaffPage(...roles: StaffRole[]): Promise<Staff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/staff");
  if (roles.length && !hasRole(staff, ...roles)) redirect("/staff?error=forbidden");
  return staff;
}

/** For staff actions: returns the staff user or throws, so nothing changes without a role. */
export async function requireStaffAction(...roles: StaffRole[]): Promise<Staff> {
  const staff = await getCurrentStaff();
  if (!staff || (roles.length && !hasRole(staff, ...roles))) {
    throw new Error("Not authorised");
  }
  return staff;
}

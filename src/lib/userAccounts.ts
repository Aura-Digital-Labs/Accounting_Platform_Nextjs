import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

/**
 * Ensure a corresponding accounting account exists for a user.
 * - Employees/PMs get an EMP-{id} liability (payable) account.
 * - Financial officers get an EMP-{id} liability (payable) account.
 * - Admins get an ADM-{id} equity account.
 * - Clients get no automatic account.
 *
 * Port of services/user_accounts.py::ensure_user_account
 */
export async function ensureUserAccount(
  userId: string,
  role: UserRole,
  nameLabel: string
) {
  let code: string;
  let name: string;
  let accountType: "asset" | "liability" | "equity" | "revenue" | "expense";

  switch (role) {
    case "employee":
      code = `EMP-${userId}`;
      name = `Employee Payable ${nameLabel}`;
      accountType = "liability";
      break;
    case "project_manager":
      code = `EMP-${userId}`;
      name = `Project Manager Payable ${nameLabel}`;
      accountType = "liability";
      break;
    case "financial_officer":
      code = `EMP-${userId}`;
      name = `Financial Officer Payable ${nameLabel}`;
      accountType = "liability";
      break;
    case "admin":
      code = `ADM-${userId}`;
      name = `Admin Equity ${nameLabel}`;
      accountType = "equity";
      break;
    default:
      // Clients don't get an automatic account
      return null;
  }

  const existing = await prisma.account.findUnique({ where: { code } });

  if (!existing) {
    return prisma.account.create({
      data: { code, name, type: accountType },
    });
  }

  // Update if type or name has drifted
  if (existing.type !== accountType || existing.name !== name) {
    return prisma.account.update({
      where: { code },
      data: { type: accountType, name },
    });
  }

  return existing;
}

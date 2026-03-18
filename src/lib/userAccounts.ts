import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

/**
 * Ensure a corresponding accounting account exists for a user.
 * - Employees/PMs get an EMP-{id} liability (payable) account.
 * - Admins get an ADM-{id} equity account.
 * - Clients get no automatic account.
 *
 * Port of services/user_accounts.py::ensure_user_account
 */
export async function ensureUserAccount(
  userId: number,
  role: UserRole,
  fullName: string
) {
  let code: string;
  let name: string;
  let accountType: "asset" | "liability" | "equity" | "revenue" | "expense";

  switch (role) {
    case "employee":
      code = `EMP-${userId}`;
      name = `Employee Payable ${fullName}`;
      accountType = "liability";
      break;
    case "project_manager":
      code = `EMP-${userId}`;
      name = `Project Manager Payable ${fullName}`;
      accountType = "liability";
      break;
    case "admin":
      code = `ADM-${userId}`;
      name = `Admin Equity ${fullName}`;
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

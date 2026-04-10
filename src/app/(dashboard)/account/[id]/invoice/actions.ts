"use server";

import { requireAdmin } from "@/lib/auth";
import { logAuditAction, AuditAction } from "@/lib/auditLog";
import { headers } from "next/headers";

export async function logInvoiceViewAction(accountId: number) {
  const currentUser = await requireAdmin();
  const headersList = await headers();
  const ipAddress = headersList.get("x-forwarded-for") || undefined;
  const userAgent = headersList.get("user-agent") || undefined;

  await logAuditAction({
    userId: currentUser.id,
    action: AuditAction.INVOICE_GENERATED,
    resourceType: "Account",
    resourceId: accountId.toString(),
    description: `Generated invoice view for account ${accountId}`,
    ipAddress,
    userAgent,
    status: "success",
  });
}
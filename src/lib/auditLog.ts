import { prisma } from "@/lib/prisma";

export enum AuditAction {
  // Auth
  USER_LOGIN = "user.login",
  USER_LOGOUT = "user.logout",

  // Users
  USER_CREATED = "user.created",
  USER_UPDATED = "user.updated",
  USER_ROLE_CHANGED = "user.role.changed",

  // Expenses
  EXPENSE_SUBMITTED = "expense.submitted",
  EXPENSE_UPDATED = "expense.updated",
  EXPENSE_APPROVED_PM = "expense.approved_by_pm",
  EXPENSE_REJECTED_PM = "expense.rejected_by_pm",
  EXPENSE_APPROVED_FO = "expense.approved",
  EXPENSE_REJECTED_FO = "expense.rejected",

  // Projects
  PROJECT_CREATED = "project.created",
  CREATE_PROJECT = "project.created",
  PROJECT_UPDATED = "project.updated",
  UPDATE_PROJECT = "project.updated",
  PROJECT_EMPLOYEE_ASSIGNED = "project.employee.assigned",
  PROJECT_EMPLOYEE_REMOVED = "project.employee.removed",
  PROJECT_PM_ASSIGNED = "project.pm.assigned",

  // Payments
  PAYMENT_SUBMITTED = "payment.submitted",
  PAYMENT_APPROVED_PM = "payment.approved_by_pm",
  PAYMENT_REJECTED_PM = "payment.rejected_by_pm",
  PAYMENT_APPROVED_FO = "payment.approved",
  PAYMENT_REJECTED_FO = "payment.rejected",
  PAYMENT_CONFIRMED = "payment.confirmed",
  PAYMENT_REJECTED = "payment.rejected_fallback",

  // Accounts
  ACCOUNT_CREATED = "account.created",
  ACCOUNT_UPDATED = "account.updated",
  ACCOUNT_CLOSED = "account.closed",

  // Transactions
  TRANSACTION_CREATED = "transaction.created",
  TRANSACTION_UPDATED = "transaction.updated",
  TRANSACTION_REIMBURSED = "transaction.reimbursed",
  TRANSACTION_CHECKED = "transaction.checked",

  // Reports / Documents
  INVOICE_GENERATED = "invoice.generated",

  // Bank Statements
  BANK_STATEMENT_UPLOADED = "bank_statement.uploaded",
}

interface AuditLogInput {
  userId: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  description?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  status: "success" | "failed";
  errorMessage?: string;
}

export async function logAuditAction(input: AuditLogInput) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId || "",
        description: input.description || "",
        oldValues: input.oldValues ?? undefined,
        newValues: input.newValues ?? undefined,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        status: input.status,
        errorMessage: input.errorMessage,
      },
    });
  } catch (error) {
    // We intentionally catch and swallow errors.
    // Logging failures should NEVER block core application flows or crash an API route.
    console.error("Audit log failed to record:", error);
  }
}

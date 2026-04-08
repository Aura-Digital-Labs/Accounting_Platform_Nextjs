import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

export type ExpenseRecord = {
  id: string;
  projectId: string;
  employeeId: string;
  description: string;
  amount: number | string;
  expenseDate: Date;
  receiptPath: string | null;
  paymentSource: string;
  status: string;
  createdTransactionId: number | null;
  approvedByPmId: string | null;
  finalExpenseAmount: number | string | null;
  pmApprovalDate: Date | null;
  pmApprovalNotes: string | null;
};

type CreateExpenseData = {
  id: string;
  projectId: string;
  employeeId: string;
  description: string;
  amount: Decimal;
  expenseDate: Date;
  receiptPath: string | null;
  paymentSource: string;
  status: string;
  pmApprovalNotes?: string | null;
};

type UpdateExpenseData = {
  status?: string;
  finalExpenseAmount?: Decimal | null;
  approvedByPmId?: string | null;
  pmApprovalDate?: Date | null;
  pmApprovalNotes?: string | null;
  createdTransactionId?: number | null;
};

let hasExpenseStatusEnumCache: boolean | null = null;

function expenseSelectSql() {
  return Prisma.sql`
    SELECT
      id,
      project_id AS "projectId",
      employee_id AS "employeeId",
      description,
      amount,
      expense_date AS "expenseDate",
      receipt_path AS "receiptPath",
      payment_source AS "paymentSource",
      status,
      created_transaction_id AS "createdTransactionId",
      approved_by_pm_id AS "approvedByPmId",
      final_expense_amount AS "finalExpenseAmount",
      pm_approval_date AS "pmApprovalDate",
      pm_approval_notes AS "pmApprovalNotes"
    FROM expenses
  `;
}

export async function hasExpenseStatusEnum() {
  if (hasExpenseStatusEnumCache !== null) {
    return hasExpenseStatusEnumCache;
  }

  const rows = (await prisma.$queryRawUnsafe(`
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'expensestatus'
    LIMIT 1
  `)) as Array<{ "?column?": number }>;

  hasExpenseStatusEnumCache = rows.length > 0;
  return hasExpenseStatusEnumCache;
}

export async function createExpenseRaw(data: CreateExpenseData) {
  await prisma.$executeRaw`
    INSERT INTO expenses (
      id,
      project_id,
      employee_id,
      description,
      amount,
      expense_date,
      receipt_path,
      payment_source,
      status,
      pm_approval_notes
    )
    VALUES (
      ${data.id},
      ${data.projectId},
      ${data.employeeId},
      ${data.description},
      ${data.amount},
      ${data.expenseDate},
      ${data.receiptPath},
      ${data.paymentSource},
      ${data.status},
      ${data.pmApprovalNotes ?? null}
    )
  `;

  return getExpenseByIdRaw(data.id);
}

export async function getExpenseByIdRaw(id: string) {
  const rows = (await prisma.$queryRaw(Prisma.sql`
    ${expenseSelectSql()}
    WHERE id = ${id}
    LIMIT 1
  `)) as ExpenseRecord[];

  return rows[0] ?? null;
}

export async function listExpensesRaw() {
  return (await prisma.$queryRaw(Prisma.sql`
    ${expenseSelectSql()}
    ORDER BY id DESC
  `)) as ExpenseRecord[];
}

export async function listExpensesRawByEmployee(employeeId: string) {
  return (await prisma.$queryRaw(Prisma.sql`
    ${expenseSelectSql()}
    WHERE employee_id = ${employeeId}
    ORDER BY id DESC
  `)) as ExpenseRecord[];
}

export async function listExpensesRawByIds(ids: string[]) {
  if (ids.length === 0) {
    return [];
  }

  return (await prisma.$queryRaw(Prisma.sql`
    ${expenseSelectSql()}
    WHERE id IN (${Prisma.join(ids)})
    ORDER BY id ASC
  `)) as ExpenseRecord[];
}

export async function listPendingExpensesForProjectsRaw(projectIds: string[]) {
  if (projectIds.length === 0) {
    return [];
  }

  return (await prisma.$queryRaw(Prisma.sql`
    ${expenseSelectSql()}
    WHERE project_id IN (${Prisma.join(projectIds)})
      AND status = ${"pending"}
    ORDER BY id DESC
  `)) as ExpenseRecord[];
}

export async function updateExpenseRaw(id: string, data: UpdateExpenseData) {
  const sets: Prisma.Sql[] = [];

  if (data.status !== undefined) {
    sets.push(Prisma.sql`status = ${data.status}`);
  }
  if (data.finalExpenseAmount !== undefined) {
    sets.push(Prisma.sql`final_expense_amount = ${data.finalExpenseAmount}`);
  }
  if (data.approvedByPmId !== undefined) {
    sets.push(Prisma.sql`approved_by_pm_id = ${data.approvedByPmId}`);
  }
  if (data.pmApprovalDate !== undefined) {
    sets.push(Prisma.sql`pm_approval_date = ${data.pmApprovalDate}`);
  }
  if (data.pmApprovalNotes !== undefined) {
    sets.push(Prisma.sql`pm_approval_notes = ${data.pmApprovalNotes}`);
  }
  if (data.createdTransactionId !== undefined) {
    sets.push(Prisma.sql`created_transaction_id = ${data.createdTransactionId}`);
  }

  if (sets.length === 0) {
    return getExpenseByIdRaw(id);
  }

  await prisma.$executeRaw(Prisma.sql`
    UPDATE expenses
    SET ${Prisma.join(sets, ", ")}
    WHERE id = ${id}
  `);

  return getExpenseByIdRaw(id);
}

export async function updateExpenseStatusManyRaw(ids: string[], status: string) {
  if (ids.length === 0) {
    return;
  }

  await prisma.$executeRaw(Prisma.sql`
    UPDATE expenses
    SET status = ${status}
    WHERE id IN (${Prisma.join(ids)})
  `);
}

import { syncProjectFinanceStatus } from "@/lib/projectFinance";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";
import { createTransaction, AccountingError } from "@/lib/accounting";
import {
  hasExpenseStatusEnum,
  listExpensesRawByIds,
  updateExpenseRaw,
  updateExpenseStatusManyRaw,
} from "@/lib/expenseStorage";

async function getEmployeeAccount(employeeId: string) {
  const code = `EMP-${employeeId}`;
  let account = await prisma.account.findUnique({ where: { code } });

  if (!account) {
    account = await prisma.account.create({
      data: { code, name: `Employee Payable ${employeeId}`, type: "liability" },
    });
  } else if (account.type !== "liability") {
    account = await prisma.account.update({
      where: { code },
      data: { type: "liability" },
    });
  }

  return account;
}

async function getComponentProfitAccount() {
  const code = "COMP-PROFIT";
  let account = await prisma.account.findUnique({ where: { code } });

  if (!account) {
    account = await prisma.account.create({
      data: {
        code,
        name: "Component Profit",
        type: "revenue",
        description: "Profit recognized from finalized expense uplift",
      },
    });
  } else if (account.type !== "revenue") {
    account = await prisma.account.update({
      where: { code },
      data: { type: "revenue" },
    });
  }

  return account;
}

async function getExpenseCreditAccount(expense: { employeeId: string; paymentSource: string }) {
  const submitter = await prisma.user.findUnique({ where: { id: expense.employeeId } });
  if (!submitter) {
    throw new AccountingError(404, "Expense submitter not found");
  }

  if (expense.paymentSource === "petty_cash") {
    if (!submitter.pettyCashAccountId) {
      throw new AccountingError(400, "Submitter has no petty cash account");
    }

    const pettyCashAccount = await prisma.account.findUnique({
      where: { id: submitter.pettyCashAccountId },
    });

    if (!pettyCashAccount) {
      throw new AccountingError(404, "Petty cash account not found");
    }

    return pettyCashAccount;
  }

  return getEmployeeAccount(expense.employeeId);
}

/**
 * PATCH /api/expenses/group-decision
 * Admin decides an expense group (approve/reject).
 * For approvals, posts per-expense transactions (no aggregated entry merging).
 */
export async function PATCH(req: NextRequest) {
  try {
    const currentUser = await requireAdmin();
    const body = await req.json();

    const status = body.status as "approved" | "rejected";
    const expenseIds = Array.isArray(body.expense_ids)
      ? body.expense_ids
          .map((id: unknown) => String(id).trim())
          .filter((id: string) => id.length > 0)
      : [];

    if (![
      "approved",
      "rejected",
    ].includes(status)) {
      return NextResponse.json({ detail: "Invalid status" }, { status: 400 });
    }

    if (expenseIds.length === 0) {
      return NextResponse.json({ detail: "At least one expense id is required" }, { status: 400 });
    }

    const hasEnumExpenseStatus = await hasExpenseStatusEnum();

    const expenses = hasEnumExpenseStatus
      ? await prisma.expense.findMany({
          where: { id: { in: expenseIds } },
          orderBy: { id: "asc" },
        })
      : await listExpensesRawByIds(expenseIds);

    if (expenses.length !== expenseIds.length) {
      return NextResponse.json({ detail: "One or more expenses were not found" }, { status: 404 });
    }

    const invalid = expenses.find((expense) =>
      expense.status !== "pending" && expense.status !== "approved_by_pm"
    );
    if (invalid) {
      return NextResponse.json(
        { detail: `Expense #${invalid.id} has already been processed` },
        { status: 400 }
      );
    }

    const employeeId = expenses[0].employeeId;
    if (expenses.some((expense) => expense.employeeId !== employeeId)) {
      return NextResponse.json(
        { detail: "All expenses in a group must belong to the same employee" },
        { status: 400 }
      );
    }

    if (status === "rejected") {
      if (hasEnumExpenseStatus) {
        await prisma.expense.updateMany({
          where: { id: { in: expenseIds } },
          data: { status: "rejected" },
        });
      } else {
        await updateExpenseStatusManyRaw(expenseIds, "rejected");
      }

      const { logAuditAction, AuditAction } = await import("@/lib/auditLog");
      await Promise.all(
        expenseIds.map((id: number) =>
          logAuditAction({
            userId: currentUser.id,
            action: AuditAction.EXPENSE_REJECTED_FO,
            resourceType: "Expense",
            resourceId: id.toString(),
            description: `FO/Admin rejected expense ${id}`,
            status: "success",
          })
        )
      );

      return NextResponse.json({
        status: "rejected",
        expense_ids: expenseIds,
      });
    }

    const projectIds = [...new Set(expenses.map((expense) => expense.projectId))];
    const projects = await prisma.project.findMany({ where: { id: { in: projectIds } } });
    const projectById = new Map(projects.map((project) => [project.id, project]));

    if (projects.length !== projectIds.length) {
      return NextResponse.json({ detail: "One or more projects were not found" }, { status: 404 });
    }

    const accountIds = projects.map((project) => project.accountId);
    const accounts = await prisma.account.findMany({ where: { id: { in: accountIds } } });
    const accountById = new Map(accounts.map((account) => [account.id, account]));

    if (accounts.length !== accountIds.length) {
      return NextResponse.json({ detail: "One or more project accounts were not found" }, { status: 404 });
    }

    const profitAccount = await getComponentProfitAccount();
    let originalTotal = 0;
    let finalTotal = 0;
    let totalProfit = 0;

    const baseTransactionIds: number[] = [];
    const profitTransactionIds: number[] = [];

    for (const expense of expenses) {
      const project = projectById.get(expense.projectId);
      if (!project) {
        throw new AccountingError(404, "Project not found");
      }

      const projectAccount = accountById.get(project.accountId);
      if (!projectAccount) {
        throw new AccountingError(404, "Project account not found");
      }

      if (projectAccount.type !== "asset") {
        await prisma.account.update({
          where: { id: projectAccount.id },
          data: { type: "asset" },
        });
      }

      const creditAccount = await getExpenseCreditAccount({
        employeeId: expense.employeeId,
        paymentSource: expense.paymentSource,
      });

      const originalAmount = Number(expense.amount);
      const finalAmount = expense.finalExpenseAmount
        ? Number(expense.finalExpenseAmount)
        : originalAmount;

      if (finalAmount < originalAmount) {
        return NextResponse.json(
          { detail: `Final amount cannot be less than original amount for expense #${expense.id}` },
          { status: 400 }
        );
      }

      const profitAmount = Number((finalAmount - originalAmount).toFixed(2));
      originalTotal += originalAmount;
      finalTotal += finalAmount;
      totalProfit += profitAmount;

      const projectLabel = project.name || `Project ${project.id}`;
      const expenseLabel = (expense.description || "Expense").trim();
      const expenseDate = new Date(expense.expenseDate);
      const postedAt = new Date(
        expenseDate.getFullYear(),
        expenseDate.getMonth(),
        expenseDate.getDate()
      );

      const baseTx = await createTransaction(
        {
          description: `${projectLabel} expense #${expense.id} - counter ${creditAccount.code} (${expenseLabel})`,
          sourceType: "expense_group_item",
          sourceId: expense.id,
          documentLink: expense.receiptPath,
          entries: [
            { accountId: project.accountId, entryType: "debit", amount: originalAmount },
            { accountId: creditAccount.id, entryType: "credit", amount: originalAmount },
          ],
        },
        currentUser.id
      );

      await prisma.transaction.update({
        where: { id: baseTx.id },
        data: { postedAt },
      });

      baseTransactionIds.push(baseTx.id);

      if (hasEnumExpenseStatus) {
        await prisma.expense.update({
          where: { id: expense.id },
          data: {
            status: "approved",
            createdTransactionId: baseTx.id,
          },
        });
      } else {
        await updateExpenseRaw(expense.id, {
          status: "approved",
          createdTransactionId: baseTx.id,
        });
      }

      if (profitAmount > 0) {
        const profitTx = await createTransaction(
          {
            description: `${projectLabel} expense #${expense.id} - counter ${profitAccount.code} (${expenseLabel})`,
            sourceType: "expense_group_item_profit",
            sourceId: expense.id,
            documentLink: expense.receiptPath,
            entries: [
              { accountId: project.accountId, entryType: "debit", amount: profitAmount },
              { accountId: profitAccount.id, entryType: "credit", amount: profitAmount },
            ],
          },
          currentUser.id
        );

        await prisma.transaction.update({
          where: { id: profitTx.id },
          data: { postedAt },
        });

        profitTransactionIds.push(profitTx.id);
      }
    }

    const { logAuditAction, AuditAction } = await import("@/lib/auditLog");
    await Promise.all(
      expenses.map((expense) =>
        logAuditAction({
          userId: currentUser.id,
          action: AuditAction.EXPENSE_APPROVED_FO,
          resourceType: "Expense",
          resourceId: expense.id.toString(),
          description: `FO/Admin approved expense ${expense.id}`,
          status: "success",
        })
      )
    );

    return NextResponse.json({
      status: "approved",
      expense_ids: expenseIds,
      original_total: Number(originalTotal.toFixed(2)),
      final_total: Number(finalTotal.toFixed(2)),
      profit_total: Number(totalProfit.toFixed(2)),
      base_transaction_ids: baseTransactionIds,
      profit_transaction_ids: profitTransactionIds,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }

    if (error instanceof AccountingError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Failed to decide expense group";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

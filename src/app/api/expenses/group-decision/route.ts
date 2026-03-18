import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";
import { createTransaction, AccountingError } from "@/lib/accounting";

async function getEmployeeAccount(employeeId: number) {
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

/**
 * PATCH /api/expenses/group-decision
 * Admin decides an expense group (approve/reject) and posts grouped accounting entries.
 */
export async function PATCH(req: NextRequest) {
  try {
    const currentUser = await requireAdmin();
    const body = await req.json();

    const status = body.status as "approved" | "rejected";
    const expenseIds = Array.isArray(body.expense_ids)
      ? body.expense_ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id))
      : [];

    if (!["approved", "rejected"].includes(status)) {
      return NextResponse.json({ detail: "Invalid status" }, { status: 400 });
    }

    if (expenseIds.length === 0) {
      return NextResponse.json({ detail: "At least one expense id is required" }, { status: 400 });
    }

    const expenses = await prisma.expense.findMany({
      where: { id: { in: expenseIds } },
      orderBy: { id: "asc" },
    });

    if (expenses.length !== expenseIds.length) {
      return NextResponse.json({ detail: "One or more expenses were not found" }, { status: 404 });
    }

    const invalid = expenses.find((expense) => expense.status !== "pending" && expense.status !== "approved_by_pm");
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
      await prisma.expense.updateMany({
        where: { id: { in: expenseIds } },
        data: { status: "rejected" },
      });

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

    const originalTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    const finalTotal = expenses.reduce((sum, expense) => {
      const finalAmount = expense.finalExpenseAmount ? Number(expense.finalExpenseAmount) : Number(expense.amount);
      return sum + finalAmount;
    }, 0);

    if (finalTotal < originalTotal) {
      return NextResponse.json(
        { detail: "Final total cannot be less than original total" },
        { status: 400 }
      );
    }

    const projectOriginalMap = new Map<number, number>();
    const projectProfitMap = new Map<number, number>();

    expenses.forEach((expense) => {
      const original = Number(expense.amount);
      const finalAmount = expense.finalExpenseAmount ? Number(expense.finalExpenseAmount) : original;
      const profit = finalAmount - original;

      projectOriginalMap.set(expense.projectId, (projectOriginalMap.get(expense.projectId) || 0) + original);
      projectProfitMap.set(expense.projectId, (projectProfitMap.get(expense.projectId) || 0) + profit);
    });

    const employeeAccount = await getEmployeeAccount(employeeId);
    const firstExpense = expenses[0];
    const postedAt = new Date(
      firstExpense.expenseDate.getFullYear(),
      firstExpense.expenseDate.getMonth(),
      firstExpense.expenseDate.getDate()
    );
    const documentLink = expenses.find((expense) => expense.receiptPath)?.receiptPath || null;

    const baseEntries: { accountId: number; entryType: "debit" | "credit"; amount: number }[] =
      Array.from(projectOriginalMap.entries()).map(([projectId, amount]) => {
      const project = projectById.get(projectId);
      if (!project) throw new AccountingError(404, "Project not found");
      const account = accountById.get(project.accountId);
      if (!account) throw new AccountingError(404, "Project account not found");

      return {
        accountId: account.id,
        entryType: "debit" as const,
        amount: Number(amount.toFixed(2)),
      };
    });

    baseEntries.push({
      accountId: employeeAccount.id,
      entryType: "credit",
      amount: Number(originalTotal.toFixed(2)),
    });

    const baseTx = await createTransaction(
      {
        description: `Expense group approval (${expenses.length} items) - base`,
        sourceType: "expense_group",
        sourceId: expenses[0].id,
        documentLink,
        entries: baseEntries,
      },
      currentUser.id
    );

    await prisma.transaction.update({
      where: { id: baseTx.id },
      data: { postedAt },
    });

    const totalProfit = Number((finalTotal - originalTotal).toFixed(2));
    let profitTransactionId: number | null = null;

    if (totalProfit > 0) {
      const profitAccount = await getComponentProfitAccount();

      const profitEntries: { accountId: number; entryType: "debit" | "credit"; amount: number }[] =
        Array.from(projectProfitMap.entries())
          .filter(([, amount]) => amount > 0)
          .map(([projectId, amount]) => {
          const project = projectById.get(projectId);
          if (!project) throw new AccountingError(404, "Project not found");
          const account = accountById.get(project.accountId);
          if (!account) throw new AccountingError(404, "Project account not found");

          return {
            accountId: account.id,
            entryType: "debit" as const,
            amount: Number(amount.toFixed(2)),
          };
        });

      profitEntries.push({
        accountId: profitAccount.id,
        entryType: "credit",
        amount: totalProfit,
      });

      const profitTx = await createTransaction(
        {
          description: `Expense group approval (${expenses.length} items) - component profit`,
          sourceType: "expense_group_profit",
          sourceId: expenses[0].id,
          documentLink,
          entries: profitEntries,
        },
        currentUser.id
      );

      await prisma.transaction.update({
        where: { id: profitTx.id },
        data: { postedAt },
      });

      profitTransactionId = profitTx.id;
    }

    await prisma.expense.updateMany({
      where: { id: { in: expenseIds } },
      data: {
        status: "approved",
        createdTransactionId: baseTx.id,
      },
    });

    return NextResponse.json({
      status: "approved",
      expense_ids: expenseIds,
      original_total: Number(originalTotal.toFixed(2)),
      final_total: Number(finalTotal.toFixed(2)),
      profit_total: totalProfit,
      base_transaction_id: baseTx.id,
      profit_transaction_id: profitTransactionId,
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

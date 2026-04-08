import { syncProjectFinanceStatus } from "@/lib/projectFinance";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";
import { createTransaction, AccountingError } from "@/lib/accounting";
import { Decimal } from "@prisma/client/runtime/library";
import {
  getExpenseByIdRaw,
  hasExpenseStatusEnum,
  updateExpenseRaw,
} from "@/lib/expenseStorage";

/**
 * Helper: get or create employee payable account
 */
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

/**
 * Helper: get or create component profit account
 */
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
 * PATCH /api/expenses/[expenseId]/decision — Admin approve/reject expense
 * This is the most complex endpoint: creates base + optional profit transactions.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ expenseId: string }> }
) {
  try {
    const currentUser = await requireAdmin();
    const { expenseId } = await params;
    const id = String(expenseId);
    const body = await req.json();

    const hasEnumExpenseStatus = await hasExpenseStatusEnum();
    const expense = hasEnumExpenseStatus
      ? await prisma.expense.findUnique({ where: { id } })
      : await getExpenseByIdRaw(id);
    if (!expense) {
      return NextResponse.json({ detail: "Expense not found" }, { status: 404 });
    }

    // Allow admin to approve if status is pending or approved_by_pm
    if (expense.status !== "pending" && expense.status !== "approved_by_pm") {
      return NextResponse.json(
        { detail: "Expense has already been processed" },
        { status: 400 }
      );
    }

    // Normalize final expense amount if provided
    let normalizedFinalAmount: Decimal | null = null;
    if (body.final_expense_amount !== undefined && body.final_expense_amount !== null) {
      normalizedFinalAmount = new Decimal(Number(body.final_expense_amount).toFixed(2));
      if (normalizedFinalAmount.lte(0)) {
        return NextResponse.json(
          { detail: "Final expense amount must be greater than zero" },
          { status: 400 }
        );
      }
    }

    let updated;
    if (hasEnumExpenseStatus) {
      updated = await prisma.$transaction(async (tx) => {
        if (normalizedFinalAmount !== null) {
          await tx.expense.update({
            where: { id },
            data: { finalExpenseAmount: normalizedFinalAmount },
          });
        }

        if (body.status === "approved") {
          const project = await tx.project.findUnique({ where: { id: expense.projectId } });
          if (!project) throw new AccountingError(404, "Project not found");

          const projectAccount = await tx.account.findUnique({ where: { id: project.accountId } });
          if (!projectAccount) throw new AccountingError(404, "Project account not found");

          if (projectAccount.type !== "asset") {
            await tx.account.update({
              where: { id: projectAccount.id },
              data: { type: "asset" },
            });
          }

          const submitter = await tx.user.findUnique({ where: { id: expense.employeeId } });
          if (!submitter) throw new AccountingError(404, "Expense submitter not found");

          let creditAccount;
          if (expense.paymentSource === "petty_cash") {
            if (!submitter.pettyCashAccountId) {
              throw new AccountingError(400, "Submitter has no petty cash account");
            }
            creditAccount = await tx.account.findUnique({
              where: { id: submitter.pettyCashAccountId },
            });
            if (!creditAccount) throw new AccountingError(404, "Petty cash account not found");
          } else {
            creditAccount = await getEmployeeAccount(expense.employeeId);
          }

          const originalAmount = Number(expense.amount);
          const finalAmount = normalizedFinalAmount
            ? Number(normalizedFinalAmount)
            : originalAmount;

          if (finalAmount < originalAmount) {
            throw new AccountingError(400, "Final amount cannot be less than original amount");
          }

          const profitAmount = finalAmount - originalAmount;
          const projectLabel = project.name || `Project ${project.id}`;
          const expenseLabel = (expense.description || "Expense").trim();

          const baseTx = await createTransaction(
            {
              description: `${projectLabel} expense #${expense.id} - base (${expenseLabel})`,
              sourceType: "expense",
              sourceId: expense.id,
              documentLink: expense.receiptPath,
              entries: [
                { accountId: project.accountId, entryType: "debit", amount: originalAmount },
                { accountId: creditAccount.id, entryType: "credit", amount: originalAmount },
              ],
            },
            currentUser.id
          );

          const expenseDate = new Date(expense.expenseDate);

          await tx.transaction.update({
            where: { id: baseTx.id },
            data: {
              postedAt: new Date(
                expenseDate.getFullYear(),
                expenseDate.getMonth(),
                expenseDate.getDate()
              ),
            },
          });

          await tx.expense.update({
            where: { id },
            data: {
              status: "approved",
              createdTransactionId: baseTx.id,
            },
          });

          if (profitAmount > 0) {
            const profitAccount = await getComponentProfitAccount();

            const profitTx = await createTransaction(
              {
                description: `${projectLabel} expense #${expense.id} - profit (${expenseLabel})`,
                sourceType: "expense_profit",
                sourceId: expense.id,
                documentLink: expense.receiptPath,
                entries: [
                  { accountId: project.accountId, entryType: "debit", amount: profitAmount },
                  { accountId: profitAccount.id, entryType: "credit", amount: profitAmount },
                ],
              },
              currentUser.id
            );

            await tx.transaction.update({
              where: { id: profitTx.id },
              data: {
                postedAt: new Date(
                  expenseDate.getFullYear(),
                  expenseDate.getMonth(),
                  expenseDate.getDate()
                ),
              },
            });
          }
        } else {
          await tx.expense.update({
            where: { id },
            data: { status: body.status },
          });
        }

        return tx.expense.findUnique({ where: { id } });
      });
    } else {
      if (normalizedFinalAmount !== null) {
        await updateExpenseRaw(id, { finalExpenseAmount: normalizedFinalAmount });
      }

      if (body.status === "approved") {
        const project = await prisma.project.findUnique({ where: { id: expense.projectId } });
        if (!project) throw new AccountingError(404, "Project not found");

        const projectAccount = await prisma.account.findUnique({ where: { id: project.accountId } });
        if (!projectAccount) throw new AccountingError(404, "Project account not found");

        if (projectAccount.type !== "asset") {
          await prisma.account.update({
            where: { id: projectAccount.id },
            data: { type: "asset" },
          });
        }

        const submitter = await prisma.user.findUnique({ where: { id: expense.employeeId } });
        if (!submitter) throw new AccountingError(404, "Expense submitter not found");

        let creditAccount;
        if (expense.paymentSource === "petty_cash") {
          if (!submitter.pettyCashAccountId) {
            throw new AccountingError(400, "Submitter has no petty cash account");
          }
          creditAccount = await prisma.account.findUnique({
            where: { id: submitter.pettyCashAccountId },
          });
          if (!creditAccount) throw new AccountingError(404, "Petty cash account not found");
        } else {
          creditAccount = await getEmployeeAccount(expense.employeeId);
        }

        const originalAmount = Number(expense.amount);
        const finalAmount = normalizedFinalAmount
          ? Number(normalizedFinalAmount)
          : originalAmount;

        if (finalAmount < originalAmount) {
          throw new AccountingError(400, "Final amount cannot be less than original amount");
        }

        const profitAmount = finalAmount - originalAmount;
        const projectLabel = project.name || `Project ${project.id}`;
        const expenseLabel = (expense.description || "Expense").trim();

        const baseTx = await createTransaction(
          {
            description: `${projectLabel} expense #${expense.id} - base (${expenseLabel})`,
            sourceType: "expense",
            sourceId: expense.id,
            documentLink: expense.receiptPath,
            entries: [
              { accountId: project.accountId, entryType: "debit", amount: originalAmount },
              { accountId: creditAccount.id, entryType: "credit", amount: originalAmount },
            ],
          },
          currentUser.id
        );

        const expenseDate = new Date(expense.expenseDate);

        await prisma.transaction.update({
          where: { id: baseTx.id },
          data: {
            postedAt: new Date(
              expenseDate.getFullYear(),
              expenseDate.getMonth(),
              expenseDate.getDate()
            ),
          },
        });

        await updateExpenseRaw(id, {
          status: "approved",
          createdTransactionId: baseTx.id,
        });

        if (profitAmount > 0) {
          const profitAccount = await getComponentProfitAccount();

          const profitTx = await createTransaction(
            {
              description: `${projectLabel} expense #${expense.id} - profit (${expenseLabel})`,
              sourceType: "expense_profit",
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
            data: {
              postedAt: new Date(
                expenseDate.getFullYear(),
                expenseDate.getMonth(),
                expenseDate.getDate()
              ),
            },
          });
        }
      } else {
        await updateExpenseRaw(id, { status: body.status });
      }

      updated = await getExpenseByIdRaw(id);
    }

    await syncProjectFinanceStatus(expense.projectId);
    return NextResponse.json(updated);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    if (error instanceof AccountingError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to decide expense";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

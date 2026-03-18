import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";
import { createTransaction, AccountingError } from "@/lib/accounting";

/**
 * POST /api/transactions/reimburse/[expenseId] — Create reimbursement transaction (admin only)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ expenseId: string }> }
) {
  try {
    const currentUser = await requireAdmin();
    const { expenseId } = await params;
    const id = Number(expenseId);
    const { searchParams } = new URL(req.url);
    const bankAccountId = Number(searchParams.get("bank_account_id") || searchParams.get("bankAccountId"));

    if (!bankAccountId) {
      return NextResponse.json(
        { detail: "bank_account_id is required" },
        { status: 400 }
      );
    }

    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense || expense.status !== "approved") {
      return NextResponse.json(
        { detail: "Approved expense not found" },
        { status: 404 }
      );
    }

    const employeeAccount = await prisma.account.findUnique({
      where: { code: `EMP-${expense.employeeId}` },
    });

    const bank = await prisma.account.findUnique({
      where: { id: bankAccountId },
    });

    if (!employeeAccount || !bank) {
      return NextResponse.json(
        { detail: "Required account not found" },
        { status: 404 }
      );
    }

    const tx = await createTransaction(
      {
        description: `Reimbursement for expense #${expense.id}`,
        sourceType: "reimbursement",
        sourceId: expense.id,
        documentLink: expense.receiptPath,
        entries: [
          {
            accountId: employeeAccount.id,
            entryType: "debit",
            amount: Number(expense.amount),
          },
          {
            accountId: bank.id,
            entryType: "credit",
            amount: Number(expense.amount),
          },
        ],
      },
      currentUser.id
    );

    return NextResponse.json(
      { message: "Reimbursement recorded", transaction_id: tx.id },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    if (error instanceof AccountingError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to reimburse";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

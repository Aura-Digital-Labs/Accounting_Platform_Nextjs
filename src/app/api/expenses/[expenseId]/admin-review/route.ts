import { NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";

/**
 * PATCH /api/expenses/[expenseId]/admin-review
 * Admin updates reviewed final value before group approval.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ expenseId: string }> }
) {
  try {
    await requireAdmin();

    const { expenseId } = await params;
    const id = Number(expenseId);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ detail: "Invalid expense id" }, { status: 400 });
    }

    const body = await req.json();
    const normalizedFinalAmount = Number(Number(body.final_expense_amount).toFixed(2));

    if (!Number.isFinite(normalizedFinalAmount) || normalizedFinalAmount <= 0) {
      return NextResponse.json(
        { detail: "Final expense amount must be greater than zero" },
        { status: 400 }
      );
    }

    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) {
      return NextResponse.json({ detail: "Expense not found" }, { status: 404 });
    }

    if (expense.status !== "pending" && expense.status !== "approved_by_pm") {
      return NextResponse.json({ detail: "Expense has already been processed" }, { status: 400 });
    }

    const updated = await prisma.expense.update({
      where: { id },
      data: {
        finalExpenseAmount: new Decimal(normalizedFinalAmount.toFixed(2)),
      },
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Failed to update review";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

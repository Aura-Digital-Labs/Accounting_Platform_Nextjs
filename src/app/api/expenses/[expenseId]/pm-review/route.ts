import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import { Decimal } from "@prisma/client/runtime/library";
import {
  getExpenseByIdRaw,
  hasExpenseStatusEnum,
  updateExpenseRaw,
} from "@/lib/expenseStorage";

/**
 * PATCH /api/expenses/[expenseId]/pm-review — PM updates review values without deciding
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ expenseId: string }> }
) {
  try {
    const currentUser = await requireAuth();

    if (String(currentUser.role).toLowerCase() !== "project_manager") {
      return NextResponse.json(
        { detail: "Only project managers can update review" },
        { status: 403 }
      );
    }

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

    if (expense.status !== "pending") {
      return NextResponse.json(
        { detail: "Expense has already been processed" },
        { status: 400 }
      );
    }

    const assignment = await prisma.projectManagerAssignment.findFirst({
      where: {
        managerId: currentUser.id,
        projectId: expense.projectId,
      },
    });
    if (!assignment) {
      return NextResponse.json(
        { detail: "You are not assigned to this project" },
        { status: 403 }
      );
    }

    const normalizedFinalAmount = Number(
      Number(body.final_expense_amount).toFixed(2)
    );
    if (normalizedFinalAmount <= 0) {
      return NextResponse.json(
        { detail: "Final expense amount must be greater than zero" },
        { status: 400 }
      );
    }

    const updated = hasEnumExpenseStatus
      ? await prisma.expense.update({
          where: { id },
          data: {
            finalExpenseAmount: new Decimal(normalizedFinalAmount.toFixed(2)),
            pmApprovalNotes: body.pm_approval_notes || null,
          },
        })
      : await updateExpenseRaw(id, {
          finalExpenseAmount: new Decimal(normalizedFinalAmount.toFixed(2)),
          pmApprovalNotes: body.pm_approval_notes || null,
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * PATCH /api/expenses/[expenseId]/pm-decision — PM approve/reject expense
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ expenseId: string }> }
) {
  try {
    const currentUser = await requireAuth();

    if (currentUser.role !== "project_manager") {
      return NextResponse.json(
        { detail: "Only project managers can make this decision" },
        { status: 403 }
      );
    }

    const { expenseId } = await params;
    const id = Number(expenseId);
    const body = await req.json();

    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) {
      return NextResponse.json({ detail: "Expense not found" }, { status: 404 });
    }

    if (expense.status !== "pending") {
      return NextResponse.json(
        { detail: "Expense has already been processed" },
        { status: 400 }
      );
    }

    // Check PM assignment
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

    if (!["approved_by_pm", "rejected_by_pm"].includes(body.status)) {
      return NextResponse.json({ detail: "Invalid status" }, { status: 400 });
    }

    if (body.status === "approved_by_pm" && body.final_expense_amount == null) {
      return NextResponse.json(
        { detail: "Final expense amount is required for approval" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {
      status: body.status,
      approvedByPmId: currentUser.id,
      pmApprovalDate: new Date(),
      pmApprovalNotes: body.pm_approval_notes || null,
    };

    if (body.status === "approved_by_pm") {
      const normalizedFinalAmount = Number(Number(body.final_expense_amount).toFixed(2));
      if (normalizedFinalAmount <= 0) {
        return NextResponse.json(
          { detail: "Final expense amount must be greater than zero" },
          { status: 400 }
        );
      }
      updateData.finalExpenseAmount = new Decimal(normalizedFinalAmount.toFixed(2));
    }

    const updated = await prisma.expense.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to decide expense";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

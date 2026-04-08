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

    const updated = hasEnumExpenseStatus
      ? await prisma.expense.update({
          where: { id },
          data: updateData,
        })
      : await updateExpenseRaw(id, {
          status: String(updateData.status),
          approvedByPmId: (updateData.approvedByPmId as string | null) ?? null,
          pmApprovalDate: (updateData.pmApprovalDate as Date | null) ?? null,
          pmApprovalNotes: (updateData.pmApprovalNotes as string | null) ?? null,
          finalExpenseAmount:
            (updateData.finalExpenseAmount as Decimal | null | undefined) ?? undefined,
        });

    const { logAuditAction, AuditAction } = await import("@/lib/auditLog");
    await logAuditAction({
      userId: currentUser.id,
      action: body.status === "approved_by_pm" ? AuditAction.EXPENSE_APPROVED_PM : AuditAction.EXPENSE_REJECTED_PM,
      resourceType: "Expense",
      resourceId: id.toString(),
      description: `PM ${body.status === "approved_by_pm" ? "approved" : "rejected"} expense ${id}`,
      status: "success",
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

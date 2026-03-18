import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

/**
 * GET /api/expenses/pm/pending — PM's pending expenses for assigned projects
 */
export async function GET() {
  try {
    const currentUser = await requireAuth();

    if (currentUser.role !== "project_manager") {
      return NextResponse.json(
        { detail: "Only project managers can access this endpoint" },
        { status: 403 }
      );
    }

    const assignedProjects = await prisma.projectManagerAssignment.findMany({
      where: { managerId: currentUser.id },
      select: { projectId: true },
    });
    const projectIds = assignedProjects.map((p) => p.projectId);

    if (projectIds.length === 0) {
      return NextResponse.json([]);
    }

    const expenses = await prisma.expense.findMany({
      where: {
        projectId: { in: projectIds },
        status: "pending",
      },
      orderBy: { id: "desc" },
      include: {
        employee: { select: { fullName: true } },
        project: { select: { name: true } },
      },
    });

    return NextResponse.json(
      expenses.map((e) => ({
        id: e.id,
        project_id: e.projectId,
        employee_id: e.employeeId,
        project_name: e.project.name,
        employee_name: e.employee.fullName,
        description: e.description,
        amount: Number(e.amount),
        expense_date: e.expenseDate,
        receipt_path: e.receiptPath,
        payment_source: e.paymentSource,
        status: e.status,
        created_transaction_id: e.createdTransactionId,
        approved_by_pm_id: e.approvedByPmId,
        final_expense_amount: e.finalExpenseAmount ? Number(e.finalExpenseAmount) : null,
        pm_approval_date: e.pmApprovalDate,
        pm_approval_notes: e.pmApprovalNotes,
      }))
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    return NextResponse.json({ detail: "Failed to list pending expenses" }, { status: 500 });
  }
}

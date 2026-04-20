import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import {
  hasExpenseStatusEnum,
  listPendingExpensesForProjectsRaw,
} from "@/lib/expenseStorage";

/**
 * GET /api/expenses/pm/pending — PM's pending expenses for assigned projects
 */
export async function GET() {
  try {
    const currentUser = await requireAuth();

    if (String(currentUser.role).toLowerCase() !== "project_manager") {
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

    const hasEnumExpenseStatus = await hasExpenseStatusEnum();

    const expenses = hasEnumExpenseStatus
      ? await prisma.expense.findMany({
          where: {
            projectId: { in: projectIds },
            status: "pending",
          },
          orderBy: { id: "desc" },
          include: {
            employee: { select: { name: true } },
            project: { select: { name: true } },
          },
        })
      : await listPendingExpensesForProjectsRaw(projectIds);

    const rawProjectNameById = new Map<string, string>();
    const rawEmployeeNameById = new Map<string, string>();

    if (!hasEnumExpenseStatus) {
      const expenseRows = expenses as Array<{ projectId: string; employeeId: string }>;
      const uniqueProjectIds = [...new Set(expenseRows.map((e) => e.projectId))];
      const uniqueEmployeeIds = [...new Set(expenseRows.map((e) => e.employeeId))];

      const [projects, employees] = await Promise.all([
        prisma.project.findMany({
          where: { id: { in: uniqueProjectIds } },
          select: { id: true, name: true },
        }),
        prisma.user.findMany({
          where: { id: { in: uniqueEmployeeIds } },
          select: { id: true, name: true },
        }),
      ]);

      for (const p of projects) {
        rawProjectNameById.set(p.id, p.name);
      }
      for (const u of employees) {
        rawEmployeeNameById.set(u.id, u.name);
      }
    }

    return NextResponse.json(
      expenses.map((e) => ({
        id: e.id,
        project_id: e.projectId,
        employee_id: e.employeeId,
        project_name:
          "project" in e && e.project
            ? e.project.name
            : rawProjectNameById.get(e.projectId) || e.projectId,
        employee_name:
          "employee" in e && e.employee
            ? e.employee.name
            : rawEmployeeNameById.get(e.employeeId) || e.employeeId,
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

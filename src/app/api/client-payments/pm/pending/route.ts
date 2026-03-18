import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

/**
 * GET /api/client-payments/pm/pending — PM's pending payments for assigned projects
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

    const payments = await prisma.clientPayment.findMany({
      where: {
        projectId: { in: projectIds },
        status: "pending",
      },
      orderBy: { id: "desc" },
      include: {
        client: { select: { fullName: true } },
        project: { select: { name: true } },
      },
    });

    return NextResponse.json(
      payments.map((p) => ({
        id: p.id,
        project_id: p.projectId,
        client_id: p.clientId,
        project_name: p.project.name,
        client_name: p.client.fullName,
        payment_account_id: p.paymentAccountId,
        amount: Number(p.amount),
        payment_date: p.paymentDate,
        description: p.description,
        document_link: p.documentLink,
        status: p.status,
        created_transaction_id: p.createdTransactionId,
        approved_by_pm_id: p.approvedByPmId,
        pm_approval_date: p.pmApprovalDate,
        pm_approval_notes: p.pmApprovalNotes,
      }))
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    return NextResponse.json({ detail: "Failed to list pending payments" }, { status: 500 });
  }
}

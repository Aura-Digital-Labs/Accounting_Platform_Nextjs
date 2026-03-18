import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

/**
 * PATCH /api/client-payments/[paymentId]/pm-decision — PM approve/reject payment
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const currentUser = await requireAuth();

    if (currentUser.role !== "project_manager") {
      return NextResponse.json(
        { detail: "Only project managers can make this decision" },
        { status: 403 }
      );
    }

    const { paymentId } = await params;
    const id = Number(paymentId);
    const body = await req.json();

    const payment = await prisma.clientPayment.findUnique({ where: { id } });
    if (!payment) {
      return NextResponse.json({ detail: "Payment not found" }, { status: 404 });
    }

    if (payment.status !== "pending") {
      return NextResponse.json(
        { detail: "Payment has already been processed" },
        { status: 400 }
      );
    }

    // Check PM assignment
    const assignment = await prisma.projectManagerAssignment.findFirst({
      where: {
        managerId: currentUser.id,
        projectId: payment.projectId,
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

    const updated = await prisma.clientPayment.update({
      where: { id },
      data: {
        status: body.status,
        approvedByPmId: currentUser.id,
        pmApprovalDate: new Date(),
        pmApprovalNotes: body.pm_approval_notes || null,
      },
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to decide payment";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

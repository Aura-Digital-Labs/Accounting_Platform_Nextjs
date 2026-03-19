import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";
import { createTransaction, AccountingError } from "@/lib/accounting";

/**
 * PATCH /api/client-payments/[paymentId]/decision — Admin approve/reject
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const currentUser = await requireAdmin();
    const { paymentId } = await params;
    const id = Number(paymentId);
    const body = await req.json();

    const payment = await prisma.clientPayment.findUnique({ where: { id } });
    if (!payment) {
      return NextResponse.json({ detail: "Payment not found" }, { status: 404 });
    }

    if (payment.status !== "approved_by_pm") {
      return NextResponse.json(
        { detail: "Payment must be reviewed by PM before admin decision" },
        { status: 400 }
      );
    }

    if (!["approved", "rejected"].includes(body.status)) {
      return NextResponse.json({ detail: "Invalid status" }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (body.status === "approved") {
        const project = await tx.project.findUnique({ where: { id: payment.projectId } });
        if (!project) throw new AccountingError(404, "Project not found");

        const txRecord = await createTransaction(
          {
            description: `Payment for project ${project.name || project.id} - ${payment.description || ""}`,
            sourceType: "client_payment",
            sourceId: payment.id,
            documentLink: payment.documentLink,
            entries: [
              { accountId: payment.paymentAccountId, entryType: "debit", amount: Number(payment.amount) },
              { accountId: project.accountId, entryType: "credit", amount: Number(payment.amount) },
            ],
          },
          currentUser.id
        );

        // Map postedAt to paymentDate
        await tx.transaction.update({
          where: { id: txRecord.id },
          data: {
            postedAt: new Date(
              payment.paymentDate.getFullYear(),
              payment.paymentDate.getMonth(),
              payment.paymentDate.getDate()
            ),
          },
        });

        await tx.clientPayment.update({
          where: { id },
          data: {
            status: "approved",
            createdTransactionId: txRecord.id,
          },
        });
      } else {
        await tx.clientPayment.update({
          where: { id },
          data: { status: "rejected" },
        });
      }

      return tx.clientPayment.findUnique({ where: { id } });
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    if (error instanceof AccountingError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to decide payment";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

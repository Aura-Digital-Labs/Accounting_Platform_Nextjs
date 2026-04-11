import { generateReceiptPdf, sendReceiptEmail } from "@/lib/emailService";
import { syncProjectFinanceStatus } from "@/lib/projectFinance";
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
    const id = String(paymentId);
    const body = await req.json();

    const payment = await prisma.clientPayment.findUnique({ where: { id } });
    if (!payment) {
      return NextResponse.json({ detail: "Payment not found" }, { status: 404 });
    }

    if (payment.status !== "approved_by_pm" && payment.status !== "pending") {
      return NextResponse.json(
        { detail: "Payment is already processed" },
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
            description: `Payment for project ${project.name || project.id} - ${payment.title || payment.description || ""}`,
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

        await tx.clientPayment.update({
          where: { id },
          data: {
            status: "approved",
            confirmed: true,
            confirmedAt: new Date(),
            confirmedBy: currentUser.id,
            createdTransactionId: txRecord.id,
          },
        });
      } else {
        await tx.clientPayment.update({
          where: { id },
          data: {
            status: "rejected",
            confirmed: true,
            confirmedAt: new Date(),
            confirmedBy: currentUser.id,
          },
        });
      }

      return tx.clientPayment.findUnique({ where: { id } });
    });

    const { logAuditAction, AuditAction } = await import("@/lib/auditLog");
    await logAuditAction({
      userId: currentUser.id,
      action: body.status === "approved" ? AuditAction.PAYMENT_APPROVED_FO : AuditAction.PAYMENT_REJECTED_FO,
      resourceType: "ClientPayment",
      resourceId: id.toString(),
      description: `FO/Admin ${body.status} payment ${id}`,
      status: "success",
    });

    await syncProjectFinanceStatus(payment.projectId);

    // Send email with receipt (or rejection)
    let emailStatus = { emailSent: false, receiptLink: "" };
    try {
      emailStatus = await sendReceiptEmail(payment.id, body.status) || emailStatus;
    } catch (err) {
      console.error("Error sending receipt email", err);
    }

    return NextResponse.json({ ...updated, ...emailStatus });
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import { uploadBytesToGoogleDrive } from "@/lib/googleDrive";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * POST /api/client-payments — Submit client payment (client only)
 * GET  /api/client-payments — List payments (admin: all, client: own)
 */
export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireAuth();

    if (currentUser.role !== "client") {
      return NextResponse.json(
        { detail: "Only clients can submit payments" },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const projectId = Number(formData.get("project_id"));
    const paymentAccountId = Number(formData.get("payment_account_id"));
    const amountStr = formData.get("amount") as string;
    const paymentDateStr = formData.get("payment_date") as string;
    const description = (formData.get("description") as string) || null;
    const documentFile = formData.get("document_file") as File | null;

    // Validate date
    const parsedDate = new Date(paymentDateStr);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ detail: "Invalid payment date" }, { status: 400 });
    }

    // Validate project
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.clientId !== currentUser.id) {
      return NextResponse.json(
        { detail: "Project not found or not assigned to you" },
        { status: 404 }
      );
    }

    // Validate account
    const account = await prisma.account.findUnique({ where: { id: paymentAccountId } });
    if (!account || !account.isPaymentAccepting) {
      return NextResponse.json(
        { detail: "Invalid payment account" },
        { status: 400 }
      );
    }

    // Validate amount
    const amount = Number(Number(amountStr).toFixed(2));
    if (amount <= 0) {
      return NextResponse.json(
        { detail: "Amount must be greater than zero" },
        { status: 400 }
      );
    }

    // Upload document
    let documentLink: string | null = null;
    if (documentFile && documentFile.size > 0) {
      const buffer = Buffer.from(await documentFile.arrayBuffer());
      try {
        documentLink = await uploadBytesToGoogleDrive({
          fileBuffer: buffer,
          originalName: documentFile.name,
          mimeType: documentFile.type,
          folderId: process.env.GOOGLE_DRIVE_CLIENT_PAYMENTS_FOLDER_ID || null,
          prefix: `payment-${currentUser.id}-${projectId}`,
        });
      } catch (err) {
        return NextResponse.json(
          { detail: `Document upload unavailable: ${err instanceof Error ? err.message : err}` },
          { status: 503 }
        );
      }
    }

    const payment = await prisma.clientPayment.create({
      data: {
        projectId,
        clientId: currentUser.id,
        paymentAccountId,
        amount: new Decimal(amount.toFixed(2)),
        paymentDate: parsedDate,
        description,
        documentLink,
      },
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to submit payment";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const currentUser = await requireAuth();

    let payments;
    if (currentUser.role === "admin") {
      payments = await prisma.clientPayment.findMany({
        orderBy: { id: "desc" },
        include: {
          client: { select: { fullName: true } },
          project: { select: { name: true } },
        },
      });
    } else if (currentUser.role === "client") {
      payments = await prisma.clientPayment.findMany({
        where: { clientId: currentUser.id },
        orderBy: { id: "desc" },
        include: {
          project: { select: { name: true } },
        },
      });
    } else {
      return NextResponse.json([]);
    }

    return NextResponse.json(
      payments.map((p) => ({
        id: p.id,
        project_id: p.projectId,
        client_id: p.clientId,
        project_name: p.project.name,
        client_name: "client" in p ? (p as any).client.fullName : null,
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
    return NextResponse.json({ detail: "Failed to list payments" }, { status: 500 });
  }
}

import { syncProjectFinanceStatus } from "@/lib/projectFinance";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import {
  uploadBytesToGoogleDrive,
  ensureDrivePath,
} from "@/lib/googleDrive";

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
    const projectId = String(formData.get("project_id") || "").trim();
    const paymentAccountId = Number(formData.get("payment_account_id"));
    const amountStr = formData.get("amount") as string;
    const title = String(formData.get("title") || "").trim();
    const description = (formData.get("description") as string) || null;
    const documentFile = formData.get("document_file") as File | null;

    if (!projectId) {
      return NextResponse.json({ detail: "Project is required" }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ detail: "Title is required" }, { status: 400 });
    }

    // Validate project
    const project = await prisma.project.findUnique({ where: { id: projectId }, include: { assignments: true } });
    const isAssigned = project?.clientId === currentUser.id || project?.assignments?.some(a => a.userId === currentUser.id);
    if (!project || !isAssigned) {
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
        const folderId = await ensureDrivePath([
          "Accounting Platform",
          "Projects",
          project.name,
          "Payments",
        ]);

        documentLink = await uploadBytesToGoogleDrive({
          fileBuffer: buffer,
          originalName: documentFile.name,
          mimeType: documentFile.type,
          folderId,
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
        title,
        amount,
        description,
        documentLink,
        confirmed: false,
      },
    });

    const { logAuditAction, AuditAction } = await import("@/lib/auditLog");
    await logAuditAction({
      userId: currentUser.id,
      action: AuditAction.PAYMENT_SUBMITTED,
      resourceType: "ClientPayment",
      resourceId: payment.id.toString(),
      description: `Payment submitted for project ${projectId} amount ${amount.toFixed(2)}`,
      status: "success",
    });

        await syncProjectFinanceStatus(payment.projectId);
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
    const isAdminLike =
      currentUser.role === "admin" || currentUser.role === "financial_officer";

    if (!isAdminLike && currentUser.role !== "client") {
      return NextResponse.json([]);
    }

    const payments = isAdminLike
      ? ((await prisma.$queryRaw`
          SELECT
            id,
            "projectId",
            "clientId",
            payment_account_id AS "paymentAccountId",
            title,
            amount,
            confirmed,
            "confirmedAt",
            "confirmedBy",
            description,
            document_link AS "documentLink",
            status::text AS status,
            created_transaction_id AS "createdTransactionId",
            pm_approval_notes AS "pmApprovalNotes",
            "createdAt"
          FROM "ClientPayment"
          ORDER BY id DESC
        `) as Array<{
          id: string;
          projectId: string;
          clientId: string;
          paymentAccountId: number;
          title: string;
          amount: number | string;
          confirmed: boolean;
          confirmedAt: Date | null;
          confirmedBy: string | null;
          description: string | null;
          documentLink: string | null;
          status: string;
          createdTransactionId: number | null;
          pmApprovalNotes: string | null;
          createdAt: Date;
        }>)
      : ((await prisma.$queryRaw(Prisma.sql`
          SELECT
            id,
            "projectId",
            "clientId",
            payment_account_id AS "paymentAccountId",
            title,
            amount,
            confirmed,
            "confirmedAt",
            "confirmedBy",
            description,
            document_link AS "documentLink",
            status::text AS status,
            created_transaction_id AS "createdTransactionId",
            pm_approval_notes AS "pmApprovalNotes",
            "createdAt"
          FROM "ClientPayment"
          WHERE "clientId" = ${currentUser.id}
          ORDER BY id DESC
        `)) as Array<{
          id: string;
          projectId: string;
          clientId: string;
          paymentAccountId: number;
          title: string;
          amount: number | string;
          confirmed: boolean;
          confirmedAt: Date | null;
          confirmedBy: string | null;
          description: string | null;
          documentLink: string | null;
          status: string;
          createdTransactionId: number | null;
          pmApprovalNotes: string | null;
          createdAt: Date;
        }>);

    const uniqueProjectIds = [...new Set(payments.map((p) => p.projectId))];
    const uniqueClientIds = [...new Set(payments.map((p) => p.clientId))];

    const [projects, clients] = await Promise.all([
      prisma.project.findMany({
        where: { id: { in: uniqueProjectIds } },
        select: { id: true, name: true },
      }),
      prisma.user.findMany({
        where: { id: { in: uniqueClientIds } },
        select: { id: true, name: true },
      }),
    ]);

    const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
    const clientNameById = new Map(clients.map((c) => [c.id, c.name]));

    return NextResponse.json(
      payments.map((p) => ({
        id: p.id,
        project_id: p.projectId,
        client_id: p.clientId,
        project_name: projectNameById.get(p.projectId) || p.projectId,
        client_name: clientNameById.get(p.clientId) || null,
        payment_account_id: p.paymentAccountId,
        title: p.title,
        amount: Number(p.amount),
        payment_date: p.createdAt,
        confirmed: p.confirmed,
        confirmedAt: p.confirmedAt,
        confirmedBy: p.confirmedBy,
        description: p.description,
        document_link: p.documentLink,
        status: p.status,
        created_transaction_id: p.createdTransactionId,
        pm_approval_notes: p.pmApprovalNotes,
        // Backward compatible aliases for existing UI payload readers.
        approved_by_pm_id: p.confirmedBy,
        pm_approval_date: p.confirmedAt,
      }))
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    return NextResponse.json({ detail: "Failed to list payments" }, { status: 500 });
  }
}


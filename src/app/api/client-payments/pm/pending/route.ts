import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

let hasClientPaymentStatusEnumCache: boolean | null = null;

async function hasClientPaymentStatusEnum() {
  if (hasClientPaymentStatusEnumCache !== null) {
    return hasClientPaymentStatusEnumCache;
  }

  const rows = (await prisma.$queryRawUnsafe(`
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'clientpaymentstatus'
    LIMIT 1
  `)) as Array<{ "?column?": number }>;

  hasClientPaymentStatusEnumCache = rows.length > 0;
  return hasClientPaymentStatusEnumCache;
}

/**
 * GET /api/client-payments/pm/pending — PM's pending payments for assigned projects
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

    const hasEnumClientPaymentStatus = await hasClientPaymentStatusEnum();

    const payments = hasEnumClientPaymentStatus
      ? await prisma.clientPayment.findMany({
          where: {
            projectId: { in: projectIds },
            status: "pending",
          },
          orderBy: { id: "desc" },
        })
      : ((await prisma.$queryRaw(Prisma.sql`
          SELECT
            "id",
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
            status,
            created_transaction_id AS "createdTransactionId",
            pm_approval_notes AS "pmApprovalNotes"
          FROM "ClientPayment"
          WHERE "projectId" IN (${Prisma.join(projectIds)})
            AND lower(status::text) = ${"pending"}
          ORDER BY "id" DESC
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
        client_name: clientNameById.get(p.clientId) || p.clientId,
        payment_account_id: p.paymentAccountId,
        title: p.title,
        amount: Number(p.amount),
        confirmed: p.confirmed,
        confirmedAt: p.confirmedAt,
        confirmedBy: p.confirmedBy,
        description: p.description,
        document_link: p.documentLink,
        status: p.status,
        created_transaction_id: p.createdTransactionId,
        pm_approval_notes: p.pmApprovalNotes,
        payment_date: p.confirmedAt,
        approved_by_pm_id: p.confirmedBy,
        pm_approval_date: p.confirmedAt,
      }))
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    return NextResponse.json({ detail: "Failed to list pending payments" }, { status: 500 });
  }
}

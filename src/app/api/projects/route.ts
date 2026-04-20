import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin, AuthError } from "@/lib/auth";
import { AccountingError } from "@/lib/accounting";

function isProjectStorageMismatch(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022" || error.code === "P2032")
  );
}

let needsManualIntegerIdsCache: boolean | null = null;
let hasEntryTypeEnumCache: boolean | null = null;

async function needsManualIntegerIds() {
  if (needsManualIntegerIdsCache !== null) {
    return needsManualIntegerIdsCache;
  }

  const rows = (await prisma.$queryRawUnsafe(`
    SELECT table_name, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'transactions' AND column_name = 'id')
        OR (table_name = 'transaction_entries' AND column_name = 'id'))
  `)) as Array<{ table_name: string; column_default: string | null }>;

  const map = new Map(rows.map((r) => [r.table_name, r.column_default]));
  const txHasDefault = Boolean(map.get("transactions"));
  const entryHasDefault = Boolean(map.get("transaction_entries"));

  needsManualIntegerIdsCache = !(txHasDefault && entryHasDefault);
  return needsManualIntegerIdsCache;
}

async function hasEntryTypeEnum() {
  if (hasEntryTypeEnumCache !== null) {
    return hasEntryTypeEnumCache;
  }

  const rows = (await prisma.$queryRawUnsafe(`
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'entrytype'
    LIMIT 1
  `)) as Array<{ "?column?": number }>;

  hasEntryTypeEnumCache = rows.length > 0;
  return hasEntryTypeEnumCache;
}

/**
 * POST /api/projects — Create project + account + funding
 * GET  /api/projects — List projects
 */
export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireAdmin();
    const body = await req.json();
    const manualIntegerIds = await needsManualIntegerIds();
    const hasEnumEntryType = await hasEntryTypeEnum();

    const { code, name, description, budget } = body;
    const employeeIds = Array.isArray(body.user_ids ?? body.employee_ids)
      ? (body.user_ids ?? body.employee_ids)
          .map((value: unknown) => String(value).trim())
          .filter((value: string) => value.length > 0)
      : [];
    const clientIds = Array.isArray(body.client_ids)
      ? body.client_ids
          .map((value: unknown) => String(value).trim())
          .filter((value: string) => value.length > 0)
      : [];
    const uniqueEmployeeIds = [...new Set<string>(employeeIds)];
    const uniqueClientIds = [...new Set<string>(clientIds)];
    const assignmentUserIds = [
      ...new Set<string>([...uniqueEmployeeIds, ...uniqueClientIds]),
    ];
    const primaryClientId: string | null = uniqueClientIds[0] ?? null;
    const normalizedBudget = Number(budget || 0);

    const existingCode = await prisma.project.findUnique({ where: { code } });
    if (existingCode) {
      return NextResponse.json(
        { detail: "Project code already exists" },
        { status: 409 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      if (uniqueEmployeeIds.length > 0) {
        const employees = await tx.user.findMany({
          where: {
            id: { in: uniqueEmployeeIds },
            role: "EMPLOYEE",
          },
          select: { id: true },
        });

        if (employees.length !== uniqueEmployeeIds.length) {
          throw new AccountingError(
            400,
            "One or more selected employees are invalid",
          );
        }
      }

      if (uniqueClientIds.length > 0) {
        const clients = await tx.user.findMany({
          where: {
            id: { in: uniqueClientIds },
            role: "CLIENT",
          },
          select: { id: true },
        });

        if (clients.length !== uniqueClientIds.length) {
          throw new AccountingError(
            400,
            "One or more selected clients are invalid",
          );
        }
      }

      // 1. Create project account (Asset)
      const projectAccountCode = `PRJ-${code}`;
      const projectAccount = await tx.account.create({
        data: {
          code: projectAccountCode,
          name: `Project Asset - ${name}`,
          type: "asset",
          description: `Asset account for project ${code}`,
          budget: normalizedBudget,
        },
      });

      // 2. Create project
      const project = await tx.project.create({
        data: {
          code,
          name,
          description: description || null,
          budget: normalizedBudget,
          account: { connect: { id: projectAccount.id } },
          ...(primaryClientId ? { client: { connect: { id: primaryClientId } } } : {}),
          financeStatus: normalizedBudget === 0 ? "Ready to Deliver" : "Payment Required",
          User_Project_createdByIdToUser: { connect: { id: currentUser.id } },
        },
      });

      // 3. Fund project budget (Debit project asset, Credit admin equity)
      // Keep this in the same tx so newly created accounts are visible.
      if (normalizedBudget > 0) {
        let adminAccount = await tx.account.findUnique({
          where: { code: `ADM-${currentUser.id}` },
        });

        if (!adminAccount) {
          adminAccount = await tx.account.create({
            data: {
              code: `ADM-${currentUser.id}`,
              name: `Admin Equity ${currentUser.name}`,
              type: "equity",
            },
          });
        }

        if (!manualIntegerIds && hasEnumEntryType) {
          await tx.transaction.create({
            data: {
              description: "Estimated Budget",
              createdBy: currentUser.id,
              sourceType: "project_budget",
              sourceId: project.id,
              entries: {
                create: [
                  {
                    accountId: projectAccount.id,
                    entryType: "debit",
                    amount: normalizedBudget,
                  },
                  {
                    accountId: adminAccount.id,
                    entryType: "credit",
                    amount: normalizedBudget,
                  },
                ],
              },
            },
          });
        } else {
          let transactionId: number;

          if (manualIntegerIds) {
            const txMax = await tx.transaction.aggregate({
              _max: { id: true },
            });
            transactionId = (txMax._max.id ?? 0) + 1;

            await tx.transaction.create({
              data: {
                id: transactionId,
                description: "Estimated Budget",
                createdBy: currentUser.id,
                sourceType: "project_budget",
                sourceId: project.id,
              },
              select: { id: true },
            });
          } else {
            const created = await tx.transaction.create({
              data: {
                description: "Estimated Budget",
                createdBy: currentUser.id,
                sourceType: "project_budget",
                sourceId: project.id,
              },
              select: { id: true },
            });
            transactionId = created.id;
          }

          if (manualIntegerIds) {
            const entryMax = await tx.transactionEntry.aggregate({
              _max: { id: true },
            });
            const firstEntryId = (entryMax._max.id ?? 0) + 1;

            await tx.$executeRaw`
              INSERT INTO transaction_entries (id, transaction_id, account_id, entry_type, amount, is_checked)
              VALUES (${firstEntryId}, ${transactionId}, ${projectAccount.id}, CAST(${"DEBIT"} AS entrytype), ${new Decimal(normalizedBudget.toFixed(2))}, ${false})
            `;

            await tx.$executeRaw`
              INSERT INTO transaction_entries (id, transaction_id, account_id, entry_type, amount, is_checked)
              VALUES (${firstEntryId + 1}, ${transactionId}, ${adminAccount.id}, CAST(${"CREDIT"} AS entrytype), ${new Decimal(normalizedBudget.toFixed(2))}, ${false})
            `;
          } else {
            await tx.$executeRaw`
              INSERT INTO transaction_entries (transaction_id, account_id, entry_type, amount, is_checked)
              VALUES (${transactionId}, ${projectAccount.id}, CAST(${"DEBIT"} AS entrytype), ${new Decimal(normalizedBudget.toFixed(2))}, ${false})
            `;

            await tx.$executeRaw`
              INSERT INTO transaction_entries (transaction_id, account_id, entry_type, amount, is_checked)
              VALUES (${transactionId}, ${adminAccount.id}, CAST(${"CREDIT"} AS entrytype), ${new Decimal(normalizedBudget.toFixed(2))}, ${false})
            `;
          }
        }
      }

      if (assignmentUserIds.length > 0) {
        await tx.projectAssignment.createMany({
          data: assignmentUserIds.map((userId: string) => ({
            projectId: project.id,
            userId,
          })),
          skipDuplicates: true,
        });
      }

      return {
        ...project,
        budget: Number(project.budget),
        user_ids: assignmentUserIds,
        employee_ids: uniqueEmployeeIds,
        client_ids: uniqueClientIds,
      };
    });
    try {
      const { logAuditAction, AuditAction } = await import("@/lib/auditLog");
      const { getAuditContext } = await import("@/lib/auditContext");
      await logAuditAction({
        userId: currentUser.id,
        action: AuditAction.CREATE_PROJECT,
        resourceType: "Project",
        resourceId: result.id,
        description: `Created project ${result.code} - ${result.name}`,
        newValues: result as any,
        ...getAuditContext(req),
        status: "success",
      });
    } catch (err) {
      console.error("Audit logging error (project POST)", err);
    }
    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { detail: error.message },
        { status: error.status },
      );
    }
    if (error instanceof AccountingError) {
      return NextResponse.json(
        { detail: error.message },
        { status: error.status },
      );
    }
    if (isProjectStorageMismatch(error)) {
      return NextResponse.json(
        {
          detail:
            "Project storage is not initialized correctly in this database",
        },
        { status: 503 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Failed to create project";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const currentUser = await requireAuth();
    const role = String(currentUser.role || "").toLowerCase();
    const isAdminLike = role === "admin" || role === "financial_officer";

    let projects;
    if (isAdminLike) {
      projects = await prisma.project.findMany({
        orderBy: { id: "desc" },
        include: {
          client: {
            select: {
              username: true,
            },
          },
          assignments: {
            select: {
              userId: true,
              user: {
                select: {
                  role: true,
                },
              },
            },
          },
        },
      });
    } else if (role === "client") {
      projects = await prisma.project.findMany({
        where: {
          OR: [
            { clientId: currentUser.id },
            { assignments: { some: { userId: currentUser.id } } },
          ],
        },
        orderBy: { id: "desc" },
      });
    } else if (role === "project_manager") {
      const assignments = await prisma.projectManagerAssignment.findMany({
        where: { managerId: currentUser.id },
        select: { projectId: true },
      });
      projects = await prisma.project.findMany({
        where: { id: { in: assignments.map((a) => a.projectId) } },
        orderBy: { id: "desc" },
      });
    } else {
      // employee
      const assignments = await prisma.projectAssignment.findMany({
        where: { userId: currentUser.id },
        select: { projectId: true },
      });
      projects = await prisma.project.findMany({
        where: { id: { in: assignments.map((a) => a.projectId) } },
        orderBy: { id: "desc" },
      });
    }

    return NextResponse.json(
      projects.map((p) => {
        const projectWithClient = p as typeof p & {
          client?: { username: string | null } | null;
          assignments?: Array<{
            userId: string;
            user: { role: "admin" | "employee" | "project_manager" | "client" };
          }>;
        };

        return {
          id: p.id,
          code: p.code,
          name: p.name,
          description: p.description,
          budget: Number(p.budget),
          status: p.status,
          finance_status: (p as any).financeStatus ?? null,
          account_id: p.accountId,
          client_id: p.clientId,
          user_ids: isAdminLike
            ? (projectWithClient.assignments ?? []).map((row) => row.userId)
            : [],
          employee_ids: isAdminLike
            ? (projectWithClient.assignments ?? [])
                .filter((row) => String(row.user.role).toLowerCase() === "employee")
                .map((row) => row.userId)
            : [],
          client_ids: isAdminLike
            ? (projectWithClient.assignments ?? [])
                .filter((row) => String(row.user.role).toLowerCase() === "client")
                .map((row) => row.userId)
            : [],
        };
      }),
    );
  } catch (error: unknown) {
    console.error("[GET /api/projects] CRASH:", error);
    const currentUser = await requireAuth().catch(() => null);
    const role = currentUser ? String(currentUser.role || "").toLowerCase() : "";
    const isAdminLike =
      currentUser && (role === "admin" || role === "financial_officer");

    if (error instanceof AuthError) {
      return NextResponse.json(
        { detail: error.message },
        { status: error.status },
      );
    }
    if (isProjectStorageMismatch(error)) {
      if (!currentUser) {
        return NextResponse.json([]);
      }

      let rows: Array<{
        id: string;
        code: string | null;
        name: string;
        description: string | null;
        budget: number | string;
        status: string | null;
        accountId: number | null;
        clientId: string | null;
      }> = [];

      if (isAdminLike) {
        rows = (await prisma.$queryRawUnsafe(`
          SELECT
            p.id,
            p.code,
            p.name,
            p.description,
            p.budget,
            p.status,
            p.account_id AS "accountId",
            p.client_id AS "clientId"
          FROM "Project" p
          ORDER BY p."createdAt" DESC
        `)) as typeof rows;
      } else if (role === "client") {
        rows = (await prisma.$queryRawUnsafe(
          `
          SELECT
            p.id,
            p.code,
            p.name,
            p.description,
            p.budget,
            p.status,
            p.account_id AS "accountId",
            p.client_id AS "clientId"
          FROM "Project" p
          WHERE p.client_id = $1
             OR EXISTS (
               SELECT 1
               FROM "ProjectAssignment" pa
               WHERE pa."projectId" = p.id
                 AND pa."userId" = $1
             )
          ORDER BY p."createdAt" DESC
        `,
          currentUser!.id,
        )) as typeof rows;
      } else if (role === "project_manager") {
        rows = (await prisma.$queryRawUnsafe(
          `
          SELECT
            p.id,
            p.code,
            p.name,
            p.description,
            p.budget,
            p.status,
            p.account_id AS "accountId",
            p.client_id AS "clientId"
          FROM "Project" p
          INNER JOIN project_manager_assignments pma ON pma.project_id = p.id
          WHERE pma.manager_id = $1
          ORDER BY p."createdAt" DESC
        `,
          currentUser!.id,
        )) as typeof rows;
      } else {
        rows = (await prisma.$queryRawUnsafe(
          `
          SELECT
            p.id,
            p.code,
            p.name,
            p.description,
            p.budget,
            p.status,
            p.account_id AS "accountId",
            p.client_id AS "clientId"
          FROM "Project" p
          INNER JOIN "ProjectAssignment" pa ON pa."projectId" = p.id
          WHERE pa."userId" = $1
          ORDER BY p."createdAt" DESC
        `,
          currentUser!.id,
        )) as typeof rows;
      }

      const projectIds = rows.map((r) => r.id);
      const assignments =
        isAdminLike && projectIds.length > 0
          ? await prisma.projectAssignment.findMany({
              where: { projectId: { in: projectIds } },
              select: {
                projectId: true,
                userId: true,
                user: {
                  select: { role: true },
                },
              },
            })
          : [];

      const assignmentsMap = new Map<string, string[]>();
      const employeeAssignmentsMap = new Map<string, string[]>();
      const clientAssignmentsMap = new Map<string, string[]>();
      for (const row of assignments) {
        const current = assignmentsMap.get(row.projectId) || [];
        current.push(row.userId);
        assignmentsMap.set(row.projectId, current);

        if (String(row.user.role).toLowerCase() === "employee") {
          const employeeCurrent =
            employeeAssignmentsMap.get(row.projectId) || [];
          employeeCurrent.push(row.userId);
          employeeAssignmentsMap.set(row.projectId, employeeCurrent);
        }
        if (String(row.user.role).toLowerCase() === "client") {
          const clientCurrent = clientAssignmentsMap.get(row.projectId) || [];
          clientCurrent.push(row.userId);
          clientAssignmentsMap.set(row.projectId, clientCurrent);
        }
      }

      return NextResponse.json(
        rows.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          description: row.description,
          budget: Number(row.budget || 0),
          status: row.status,
          account_id: row.accountId,
          client_id: row.clientId,
          user_ids: isAdminLike ? assignmentsMap.get(row.id) || [] : [],
          employee_ids: isAdminLike
            ? employeeAssignmentsMap.get(row.id) || []
            : [],
          client_ids: isAdminLike ? clientAssignmentsMap.get(row.id) || [] : [],
        })),
      );
    }
    const message =
      error instanceof Error ? error.message : "Failed to list projects";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

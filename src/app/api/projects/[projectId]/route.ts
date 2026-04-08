import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";

type ProjectRow = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  budget: number | string;
  accountId: number | null;
};

async function getProjectRow(id: string) {
  const rows = (await prisma.$queryRaw(Prisma.sql`
    SELECT
      p.id,
      p.code,
      p.name,
      p.description,
      p.budget,
      p.account_id AS "accountId"
    FROM "Project" p
    WHERE p.id = ${id}
    LIMIT 1
  `)) as ProjectRow[];

  return rows[0] || null;
}

async function ensureProjectAccount(
  tx: Prisma.TransactionClient,
  project: ProjectRow,
  requestedBudget?: number,
) {
  const budget = Number(
    (requestedBudget ?? Number(project.budget || 0)).toFixed(2),
  );

  if (project.accountId !== null) {
    const existing = await tx.account.findUnique({
      where: { id: project.accountId },
    });
    if (existing) {
      if (requestedBudget !== undefined) {
        await tx.account.update({
          where: { id: existing.id },
          data: { budget },
        });
      }
      return existing.id;
    }
  }

  const projectCode =
    project.code && project.code.trim().length > 0
      ? project.code.trim()
      : project.id.slice(-8).toUpperCase();

  let accountCode = `PRJ-${projectCode}`;
  let suffix = 1;
  while (await tx.account.findUnique({ where: { code: accountCode } })) {
    accountCode = `PRJ-${projectCode}-${suffix}`;
    suffix += 1;
  }

  const created = await tx.account.create({
    data: {
      code: accountCode,
      name: `Project Asset - ${project.name}`,
      type: "asset",
      description: `Asset account for project ${project.code || project.id}`,
      budget,
    },
  });

  await tx.$executeRaw(Prisma.sql`
    UPDATE "Project"
    SET account_id = ${created.id}
    WHERE id = ${project.id}
  `);

  return created.id;
}

async function getTransactionStorageMode(tx: Prisma.TransactionClient) {
  const rows = (await tx.$queryRaw(Prisma.sql`
    SELECT table_name, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'transactions' AND column_name = 'id')
        OR (table_name = 'transaction_entries' AND column_name = 'id'))
  `)) as Array<{ table_name: string; column_default: string | null }>;

  const map = new Map(rows.map((r) => [r.table_name, r.column_default]));
  const txHasDefault = Boolean(map.get("transactions"));
  const entryHasDefault = Boolean(map.get("transaction_entries"));
  const manualIntegerIds = !(txHasDefault && entryHasDefault);

  return { manualIntegerIds };
}

async function ensureAdminEquityAccount(
  tx: Prisma.TransactionClient,
  adminId: string,
  adminName: string,
) {
  const code = `ADM-${adminId}`;
  const name = `Admin Equity ${adminName}`;

  const existing = await tx.account.findUnique({ where: { code } });
  if (existing) {
    if (existing.type !== "equity" || existing.name !== name) {
      return tx.account.update({
        where: { id: existing.id },
        data: { type: "equity", name },
      });
    }
    return existing;
  }

  return tx.account.create({
    data: {
      code,
      name,
      type: "equity",
    },
  });
}

async function syncProjectBudgetPosting(
  tx: Prisma.TransactionClient,
  input: {
    projectId: string;
    projectName: string;
    projectCode: string | null;
    projectAccountId: number;
    budget: number;
    adminId: string;
    adminName: string;
  },
) {
  const { manualIntegerIds } = await getTransactionStorageMode(tx);

  const adminAccount = await ensureAdminEquityAccount(
    tx,
    input.adminId,
    input.adminName,
  );

  const existingRows = (await tx.$queryRaw(Prisma.sql`
    SELECT id
    FROM transactions
    WHERE lower(source_type::text) = ${"project_budget"}
      AND source_id = ${input.projectId}
    ORDER BY id ASC
    LIMIT 1
  `)) as Array<{ id: number }>;

  const existingTxId = existingRows[0]?.id ?? null;
  const roundedBudget = Number(input.budget.toFixed(2));

  if (roundedBudget <= 0) {
    if (existingTxId !== null) {
      await tx.$executeRaw(
        Prisma.sql`DELETE FROM transaction_entries WHERE transaction_id = ${existingTxId}`,
      );
      await tx.$executeRaw(
        Prisma.sql`DELETE FROM transactions WHERE id = ${existingTxId}`,
      );
    }
    return;
  }

  const description = "Estimated Budget";

  const insertEntries = async (transactionId: number) => {
    if (manualIntegerIds) {
      const entryMax = await tx.transactionEntry.aggregate({
        _max: { id: true },
      });
      const firstEntryId = (entryMax._max.id ?? 0) + 1;

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO transaction_entries (id, transaction_id, account_id, entry_type, amount, is_checked)
        VALUES (${firstEntryId}, ${transactionId}, ${input.projectAccountId}, ${"debit"}, ${new Decimal(roundedBudget.toFixed(2))}, ${false})
      `);

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO transaction_entries (id, transaction_id, account_id, entry_type, amount, is_checked)
        VALUES (${firstEntryId + 1}, ${transactionId}, ${adminAccount.id}, ${"credit"}, ${new Decimal(roundedBudget.toFixed(2))}, ${false})
      `);
      return;
    }

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO transaction_entries (transaction_id, account_id, entry_type, amount, is_checked)
      VALUES (${transactionId}, ${input.projectAccountId}, ${"debit"}, ${new Decimal(roundedBudget.toFixed(2))}, ${false})
    `);

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO transaction_entries (transaction_id, account_id, entry_type, amount, is_checked)
      VALUES (${transactionId}, ${adminAccount.id}, ${"credit"}, ${new Decimal(roundedBudget.toFixed(2))}, ${false})
    `);
  };

  if (existingTxId !== null) {
    await tx.$executeRaw(Prisma.sql`
      UPDATE transactions
      SET
        description = ${description},
        created_by = ${input.adminId},
        source_type = ${"project_budget"},
        source_id = ${input.projectId}
      WHERE id = ${existingTxId}
    `);

    await tx.$executeRaw(
      Prisma.sql`DELETE FROM transaction_entries WHERE transaction_id = ${existingTxId}`,
    );
    await insertEntries(existingTxId);
    return;
  }

  let transactionId: number;
  if (manualIntegerIds) {
    const txMax = await tx.transaction.aggregate({ _max: { id: true } });
    transactionId = (txMax._max.id ?? 0) + 1;

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO transactions (id, description, created_by, source_type, source_id)
      VALUES (${transactionId}, ${description}, ${input.adminId}, ${"project_budget"}, ${input.projectId})
    `);
  } else {
    const inserted = (await tx.$queryRaw(Prisma.sql`
      INSERT INTO transactions (description, created_by, source_type, source_id)
      VALUES (${description}, ${input.adminId}, ${"project_budget"}, ${input.projectId})
      RETURNING id
    `)) as Array<{ id: number }>;
    transactionId = inserted[0].id;
  }

  await insertEntries(transactionId);
}

/**
 * PATCH /api/projects/[projectId]
 * Admin updates project details and assigned users.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const currentUser = await requireAdmin();

    const { projectId } = await params;
    const id = String(projectId);
    if (!id) {
      return NextResponse.json(
        { detail: "Invalid project id" },
        { status: 400 },
      );
    }

    const body = await req.json();

    const project = await getProjectRow(id);
    if (!project) {
      return NextResponse.json(
        { detail: "Project not found" },
        { status: 404 },
      );
    }

    const employeeIds: string[] | null = Array.isArray(
      body.user_ids ?? body.employee_ids,
    )
      ? (body.user_ids ?? body.employee_ids)
          .map((value: unknown) => String(value).trim())
          .filter((value: string) => value.length > 0)
      : null;
    const clientIds: string[] | null = Array.isArray(body.client_ids)
      ? body.client_ids
          .map((value: unknown) => String(value).trim())
          .filter((value: string) => value.length > 0)
      : null;

    const updateData: {
      name?: string;
      description?: string | null;
      budget?: number;
    } = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json(
          { detail: "Project name is required" },
          { status: 400 },
        );
      }
      updateData.name = name;
    }

    if (body.description !== undefined) {
      updateData.description =
        typeof body.description === "string" &&
        body.description.trim().length > 0
          ? body.description.trim()
          : null;
    }

    if (body.budget !== undefined) {
      const budget = Number(body.budget || 0);
      if (!Number.isFinite(budget) || budget < 0) {
        return NextResponse.json(
          { detail: "Budget must be a valid non-negative number" },
          { status: 400 },
        );
      }
      updateData.budget = Number(budget.toFixed(2));
    }

    const updated = await prisma.$transaction(async (tx) => {
      const normalizedEmployeeIds: string[] = [...new Set(employeeIds ?? [])];
      const normalizedClientIds: string[] = [...new Set(clientIds ?? [])];
      const hasAssignmentUpdate = employeeIds !== null || clientIds !== null;

      if (normalizedEmployeeIds.length > 0) {
        const employees = (await tx.$queryRaw(Prisma.sql`
          SELECT id
          FROM "User"
          WHERE id IN (${Prisma.join(normalizedEmployeeIds)})
            AND lower(role::text) = ${"employee"}
        `)) as Array<{ id: string }>;

        if (employees.length !== normalizedEmployeeIds.length) {
          throw new Error("One or more selected employees are invalid");
        }
      }

      if (normalizedClientIds.length > 0) {
        const clients = (await tx.$queryRaw(Prisma.sql`
          SELECT id
          FROM "User"
          WHERE id IN (${Prisma.join(normalizedClientIds)})
            AND lower(role::text) = ${"client"}
        `)) as Array<{ id: string }>;

        if (clients.length !== normalizedClientIds.length) {
          throw new Error("One or more selected clients are invalid");
        }
      }

      if (hasAssignmentUpdate) {
        const nextAssignmentIds = [
          ...new Set<string>([
            ...normalizedEmployeeIds,
            ...normalizedClientIds,
          ]),
        ];

        await tx.projectAssignment.deleteMany({ where: { projectId: id } });

        if (nextAssignmentIds.length > 0) {
          await tx.projectAssignment.createMany({
            data: nextAssignmentIds.map((userId: string) => ({
              projectId: id,
              userId,
            })),
            skipDuplicates: true,
          });
        }
      }

      const ensuredAccountId = await ensureProjectAccount(
        tx,
        project,
        updateData.budget,
      );
      const shouldUpdateCore =
        Object.keys(updateData).length > 0 || hasAssignmentUpdate;

      if (shouldUpdateCore) {
        const nextPrimaryClientId = hasAssignmentUpdate
          ? (normalizedClientIds[0] ?? null)
          : undefined;

        if (nextPrimaryClientId !== undefined) {
          await tx.$executeRaw(Prisma.sql`
            UPDATE "Project"
            SET
              name = ${updateData.name ?? project.name},
              description = ${updateData.description !== undefined ? updateData.description : project.description},
              budget = ${updateData.budget !== undefined ? updateData.budget : Number(project.budget || 0)},
              account_id = ${ensuredAccountId},
              client_id = ${nextPrimaryClientId}
            WHERE id = ${id}
          `);
        } else {
          await tx.$executeRaw(Prisma.sql`
            UPDATE "Project"
            SET
              name = ${updateData.name ?? project.name},
              description = ${updateData.description !== undefined ? updateData.description : project.description},
              budget = ${updateData.budget !== undefined ? updateData.budget : Number(project.budget || 0)},
              account_id = ${ensuredAccountId}
            WHERE id = ${id}
          `);
        }
      } else {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "Project"
          SET account_id = ${ensuredAccountId}
          WHERE id = ${id}
        `);
      }

      const latestRows = (await tx.$queryRaw(Prisma.sql`
        SELECT
          p.id,
          p.code,
          p.name,
          p.description,
          p.budget,
          p.account_id AS "accountId"
        FROM "Project" p
        WHERE p.id = ${id}
        LIMIT 1
      `)) as ProjectRow[];

      const latestProject = latestRows[0] || project;

      await syncProjectBudgetPosting(tx, {
        projectId: latestProject.id,
        projectName: latestProject.name,
        projectCode: latestProject.code,
        projectAccountId: ensuredAccountId,
        budget: Number(latestProject.budget || 0),
        adminId: String(currentUser.id),
        adminName: String(currentUser.name || "System Admin"),
      });
      
      const { logAuditAction, AuditAction } = await import("@/lib/auditLog");
      await logAuditAction({
        userId: currentUser.id,
        action: AuditAction.UPDATE_PROJECT,
        resourceType: "Project",
        resourceId: id.toString(),
        description: `Project ${id} updated`,
        status: "success",
      });

      const assignments = await tx.projectAssignment.findMany({
        where: { projectId: id },
        select: {
          userId: true,
          user: {
            select: {
              role: true,
            },
          },
        },
      });

      return {
        id: latestProject.id,
        code: latestProject.code,
        name: latestProject.name,
        description: latestProject.description,
        budget: Number(latestProject.budget || 0),
        account_id: latestProject.accountId,
        user_ids: assignments.map((row) => row.userId),
        employee_ids: assignments
          .filter((row) => row.user.role === "employee")
          .map((row) => row.userId),
        client_ids: assignments
          .filter((row) => row.user.role === "client")
          .map((row) => row.userId),
      };
    });

    try {
      const { logAuditAction, AuditAction } = await import("@/lib/auditLog");
      const { getAuditContext } = await import("@/lib/auditContext");
      await logAuditAction({
        userId: currentUser.id,
        action: AuditAction.UPDATE_PROJECT,
        resourceType: "Project",
        resourceId: updated.id,
        description: `Updated project ${updated.code} - ${updated.name}`,
        oldValues: project as any,
        newValues: updated as any,
        ...getAuditContext(req),
        status: "success",
      });
    } catch (err) {
      console.error("Audit logging error (project PATCH)", err);
    }

    return NextResponse.json(updated);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { detail: error.message },
        { status: error.status },
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to update project";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

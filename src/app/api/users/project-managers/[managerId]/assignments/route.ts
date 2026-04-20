import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";

let pmAssignmentNeedsManualIdCache: boolean | null = null;

async function pmAssignmentNeedsManualId() {
  if (pmAssignmentNeedsManualIdCache !== null) {
    return pmAssignmentNeedsManualIdCache;
  }

  const rows = (await prisma.$queryRawUnsafe(`
    SELECT column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_manager_assignments'
      AND column_name = 'id'
    LIMIT 1
  `)) as Array<{ column_default: string | null }>;

  pmAssignmentNeedsManualIdCache = !Boolean(rows[0]?.column_default);
  return pmAssignmentNeedsManualIdCache;
}

/**
 * POST /api/users/project-managers/[managerId]/assignments
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ managerId: string }> }
) {
  try {
    await requireAdmin();
    const { managerId } = await params;
    const id = String(managerId);
    const body = await req.json();

    const pm = await prisma.user.findUnique({ where: { id } });
    if (!pm || String(pm.role).toLowerCase() !== "project_manager") {
      return NextResponse.json({ detail: "Project manager not found" }, { status: 404 });
    }

    const projectIds: string[] = Array.isArray(body.project_ids)
      ? body.project_ids
          .map((value: unknown) => String(value).trim())
          .filter((value: string) => value.length > 0)
      : [];

    const needsManualId = await pmAssignmentNeedsManualId();

    await prisma.$transaction(async (tx) => {
      // Remove all current assignments
      await tx.projectManagerAssignment.deleteMany({
        where: { managerId: id },
      });

      // Insert new assignments
      if (projectIds.length > 0) {
        if (needsManualId) {
          const idMax = await tx.projectManagerAssignment.aggregate({ _max: { id: true } });
          let nextId = (idMax._max.id ?? 0) + 1;

          await tx.projectManagerAssignment.createMany({
            data: projectIds.map((pId) => ({
              id: nextId++,
              managerId: id,
              projectId: pId,
            })),
          });
        } else {
          await tx.projectManagerAssignment.createMany({
            data: projectIds.map((pId) => ({
              managerId: id,
              projectId: pId,
            })),
          });
        }
      }
    });

    const updated = await prisma.user.findUnique({
      where: { id },
      include: { managedProjects: true },
    });

    const currentUser = await requireAdmin();
    const { logAuditAction, AuditAction } = await import("@/lib/auditLog");
    await logAuditAction({
      userId: currentUser.id,
      action: AuditAction.PROJECT_PM_ASSIGNED,
      resourceType: "User",
      resourceId: id.toString(),
      description: `Project Manager ${id} assignments updated: ${projectIds.join(", ") || "None"}`,
      status: "success",
    });

    return NextResponse.json({
      id: updated!.id,
      email: updated!.email,
      username: updated!.username,
      name: updated!.name,
      full_name: updated!.name,
      role: updated!.role,
      is_active: updated!.isActive,
      petty_cash_account_id: updated!.pettyCashAccountId,
      managed_project_ids: updated!.managedProjects.map((mp) => mp.projectId),
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to assign PM projects";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

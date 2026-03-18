import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";

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
    const id = Number(managerId);
    const body = await req.json();

    const pm = await prisma.user.findUnique({ where: { id } });
    if (!pm || pm.role !== "project_manager") {
      return NextResponse.json({ detail: "Project manager not found" }, { status: 404 });
    }

    const projectIds: number[] = body.project_ids || [];

    await prisma.$transaction(async (tx) => {
      // Remove all current assignments
      await tx.projectManagerAssignment.deleteMany({
        where: { managerId: id },
      });

      // Insert new assignments
      if (projectIds.length > 0) {
        await tx.projectManagerAssignment.createMany({
          data: projectIds.map((pId) => ({
            managerId: id,
            projectId: pId,
          })),
        });
      }
    });

    const updated = await prisma.user.findUnique({
      where: { id },
      include: { managedProjects: true },
    });

    return NextResponse.json({
      id: updated!.id,
      email: updated!.email,
      username: updated!.username,
      full_name: updated!.fullName,
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

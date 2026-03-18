import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";

/**
 * PATCH /api/users/project-managers/[managerId]
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ managerId: string }> }
) {
  try {
    await requireAdmin();
    const { managerId } = await params;
    const id = Number(managerId);
    const body = await req.json();

    const pm = await prisma.user.findUnique({
      where: { id },
      include: { managedProjects: true },
    });

    if (!pm || pm.role !== "project_manager") {
      return NextResponse.json({ detail: "Project manager not found" }, { status: 404 });
    }

    if (body.petty_cash_account_id) {
      const pcc = await prisma.account.findUnique({
        where: { id: Number(body.petty_cash_account_id) },
      });
      if (!pcc || !pcc.isPettyCash) {
        return NextResponse.json(
          { detail: "Invalid petty cash account" },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (body.full_name) updateData.fullName = body.full_name;
    if (body.petty_cash_account_id !== undefined) {
      updateData.pettyCashAccountId = body.petty_cash_account_id
        ? Number(body.petty_cash_account_id)
        : null;
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      include: { managedProjects: true },
    });

    return NextResponse.json({
      id: updated.id,
      email: updated.email,
      username: updated.username,
      full_name: updated.fullName,
      role: updated.role,
      is_active: updated.isActive,
      petty_cash_account_id: updated.pettyCashAccountId,
      managed_project_ids: updated.managedProjects.map((mp) => mp.projectId),
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to update PM";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

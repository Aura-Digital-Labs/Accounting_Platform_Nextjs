import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * PATCH /api/projects/[projectId]
 * Admin updates project details and assigned employees.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    await requireAdmin();

    const { projectId } = await params;
    const id = Number(projectId);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ detail: "Invalid project id" }, { status: 400 });
    }

    const body = await req.json();

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ detail: "Project not found" }, { status: 404 });
    }

    const employeeIds = Array.isArray(body.employee_ids)
      ? body.employee_ids
          .map((value: unknown) => Number(value))
          .filter((value: number) => Number.isFinite(value) && value > 0)
      : null;

    const updateData: {
      name?: string;
      description?: string | null;
      budget?: Decimal;
    } = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json({ detail: "Project name is required" }, { status: 400 });
      }
      updateData.name = name;
    }

    if (body.description !== undefined) {
      updateData.description =
        typeof body.description === "string" && body.description.trim().length > 0
          ? body.description.trim()
          : null;
    }

    if (body.budget !== undefined) {
      const budget = Number(body.budget || 0);
      if (!Number.isFinite(budget) || budget < 0) {
        return NextResponse.json({ detail: "Budget must be a valid non-negative number" }, { status: 400 });
      }
      updateData.budget = new Decimal(budget.toFixed(2));
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (employeeIds !== null) {
        const employees = await tx.user.findMany({
          where: {
            id: { in: employeeIds },
            role: "employee",
          },
          select: { id: true },
        });

        if (employees.length !== employeeIds.length) {
          throw new Error("One or more selected employees are invalid");
        }

        await tx.projectAssignment.deleteMany({ where: { projectId: id } });

        if (employeeIds.length > 0) {
          await tx.projectAssignment.createMany({
            data: employeeIds.map((employeeId: number) => ({
              projectId: id,
              employeeId,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (Object.keys(updateData).length > 0) {
        await tx.project.update({
          where: { id },
          data: updateData,
        });

        if (updateData.budget !== undefined) {
          await tx.account.update({
            where: { id: project.accountId },
            data: { budget: updateData.budget },
          });
        }
      }

      const latestProject = await tx.project.findUnique({
        where: { id },
        include: {
          assignments: {
            select: { employeeId: true },
          },
        },
      });

      return {
        id: latestProject?.id,
        code: latestProject?.code,
        name: latestProject?.name,
        description: latestProject?.description,
        budget: Number(latestProject?.budget || 0),
        account_id: latestProject?.accountId,
        employee_ids: latestProject?.assignments.map((row) => row.employeeId) || [],
      };
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Failed to update project";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

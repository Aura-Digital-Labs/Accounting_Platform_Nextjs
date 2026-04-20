import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";

/**
 * POST /api/projects/[projectId]/assign — Assign employee to project
 * DELETE /api/projects/[projectId]/assign/[employeeId] — Remove employee assignment
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    await requireAdmin();
    const { projectId } = await params;
      const pId = String(projectId);
    const body = await req.json();
      const userId = String(body.user_id || body.employee_id || "").trim();

      if (!userId) {
        return NextResponse.json({ detail: "user_id is required" }, { status: 400 });
      }

    const project = await prisma.project.findUnique({ where: { id: pId } });
    if (!project) {
      return NextResponse.json({ detail: "Project not found" }, { status: 404 });
    }

    const employee = await prisma.user.findUnique({ where: { id: userId } });
    if (!employee || String(employee.role).toLowerCase() !== "employee") {
      return NextResponse.json({ detail: "Employee not found or invalid role" }, { status: 400 });
    }

    const existing = await prisma.projectAssignment.findFirst({
      where: { projectId: pId, userId },
    });
    if (existing) {
      return NextResponse.json({ detail: "Employee already assigned" }, { status: 400 });
    }

    const assignment = await prisma.projectAssignment.create({
      data: { projectId: pId, userId },
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to assign employee";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

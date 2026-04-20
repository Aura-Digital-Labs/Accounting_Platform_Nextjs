import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError, hashPassword } from "@/lib/auth";
import { ensureUserAccount } from "@/lib/userAccounts";

/**
 * POST /api/users/project-managers
 * GET  /api/users/project-managers
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const normalizedEmail = String(body.email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      return NextResponse.json({ detail: "Email is required" }, { status: 400 });
    }

    if (typeof body.password !== "string" || body.password.trim().length === 0) {
      return NextResponse.json({ detail: "Password is required" }, { status: 400 });
    }

    const existingEmail = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingEmail) {
      return NextResponse.json({ detail: "Email already exists" }, { status: 409 });
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

    const hashedPassword = await hashPassword(body.password);
    const name = body.name || body.full_name;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ detail: "Name is required" }, { status: 400 });
    }
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        username: normalizedEmail,
        name: name.trim(),
        password: hashedPassword,
        role: "PROJECT_MANAGER",
        pettyCashAccountId: body.petty_cash_account_id
          ? Number(body.petty_cash_account_id)
          : null,
      },
    });

    await ensureUserAccount(user.id, "PROJECT_MANAGER" as any, user.name);

    return NextResponse.json(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        full_name: user.name,
        role: user.role,
        is_active: user.isActive,
        petty_cash_account_id: user.pettyCashAccountId,
        managed_project_ids: [],
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to create PM";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    await requireAdmin();

    const pms = (await prisma.$queryRaw(Prisma.sql`
      SELECT
        id,
        email,
        username,
        name,
        role,
        COALESCE(is_active, false) AS "isActive",
        petty_cash_account_id AS "pettyCashAccountId"
      FROM "User"
      WHERE lower(role::text) = ${"project_manager"}
      ORDER BY id DESC
    `)) as Array<{
      id: string;
      email: string;
      username: string | null;
      name: string;
      role: string;
      isActive: boolean;
      pettyCashAccountId: number | null;
    }>;

    const pmIds = pms.map((pm) => pm.id);
    const managedAssignments = pmIds.length
      ? ((await prisma.projectManagerAssignment.findMany({
          where: { managerId: { in: pmIds } },
          select: { managerId: true, projectId: true },
        })) as Array<{ managerId: string; projectId: string }>)
      : [];

    const managedByPmId = new Map<string, string[]>();
    for (const assignment of managedAssignments) {
      const list = managedByPmId.get(assignment.managerId) || [];
      list.push(assignment.projectId);
      managedByPmId.set(assignment.managerId, list);
    }

    return NextResponse.json(
      pms.map((pm) => ({
        id: pm.id,
        email: pm.email,
        username: pm.username,
        name: pm.name,
        full_name: pm.name,
        role: pm.role,
        is_active: pm.isActive,
        petty_cash_account_id: pm.pettyCashAccountId,
        managed_project_ids: managedByPmId.get(pm.id) || [],
      }))
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to list PMs";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

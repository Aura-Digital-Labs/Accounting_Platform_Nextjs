import { NextRequest, NextResponse } from "next/server";
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

    const existingEmail = await prisma.user.findUnique({
      where: { email: body.email },
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
    const user = await prisma.user.create({
      data: {
        email: body.email,
        fullName: body.full_name,
        hashedPassword,
        role: "project_manager",
        pettyCashAccountId: body.petty_cash_account_id
          ? Number(body.petty_cash_account_id)
          : null,
      },
    });

    await ensureUserAccount(user.id, user.role, user.fullName);

    return NextResponse.json(
      {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
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

    const pms = await prisma.user.findMany({
      where: { role: "project_manager" },
      include: { managedProjects: true },
      orderBy: { id: "desc" },
    });

    return NextResponse.json(
      pms.map((pm) => ({
        id: pm.id,
        email: pm.email,
        username: pm.username,
        full_name: pm.fullName,
        role: pm.role,
        is_active: pm.isActive,
        petty_cash_account_id: pm.pettyCashAccountId,
        managed_project_ids: pm.managedProjects.map((mp) => mp.projectId),
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

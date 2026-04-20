import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError, hashPassword } from "@/lib/auth";
import { ensureUserAccount } from "@/lib/userAccounts";

function normalizeRole(
  role: unknown
): "admin" | "financial_officer" | "employee" | "project_manager" | "client" {
  const value = String(role || "").toLowerCase();
  if (value === "admin") return "admin";
  if (value === "financial_officer") return "financial_officer";
  if (value === "project_manager") return "project_manager";
  if (value === "client") return "client";
  return "employee";
}

/**
 * GET /api/users — List users (admin only), optional ?role filter
 * POST /api/users — Create user (admin only)
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const role = searchParams.get("role") as string | null;

    const users = role
      ? ((await prisma.$queryRaw(Prisma.sql`
          SELECT
            id,
            email,
            username,
            name,
            role,
            COALESCE(is_active, false) AS "isActive",
            petty_cash_account_id AS "pettyCashAccountId"
          FROM "User"
          WHERE lower(role::text) = lower(${role})
          ORDER BY id DESC
        `)) as Array<{
          id: string;
          email: string;
          username: string | null;
          name: string;
          role: string;
          isActive: boolean;
          pettyCashAccountId: number | null;
        }>)
      : ((await prisma.$queryRaw`
          SELECT
            id,
            email,
            username,
            name,
            role,
            COALESCE(is_active, false) AS "isActive",
            petty_cash_account_id AS "pettyCashAccountId"
          FROM "User"
          ORDER BY id DESC
        `) as Array<{
          id: string;
          email: string;
          username: string | null;
          name: string;
          role: string;
          isActive: boolean;
          pettyCashAccountId: number | null;
        }>);

    const accountRoles = new Set(["employee", "project_manager", "admin", "financial_officer"]);
    await Promise.all(
      users
        .filter((u) => accountRoles.has(String(u.role).toLowerCase()))
        .map((u) => {
          const normalizedRole = String(u.role).toLowerCase();
          return ensureUserAccount(
            String(u.id),
            normalizedRole === "project_manager" ? "employee" : (normalizedRole as any),
            (u.name || u.email || "User").trim()
          );
        })
    );

    return NextResponse.json(
      users.map((u: any) => ({
        id: u.id,
        email: u.email,
        username: u.username,
        name: u.name,
        full_name: u.name,
        role: normalizeRole(u.role),
        is_active: u.isActive,
        petty_cash_account_id: u.pettyCashAccountId,
      }))
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to list users";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const name = body.name || body.full_name;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ detail: "Name is required" }, { status: 400 });
    }

    const existingEmail = await prisma.user.findUnique({
      where: { email: body.email },
    });
    if (existingEmail) {
      return NextResponse.json({ detail: "Email already exists" }, { status: 409 });
    }

    if (body.username) {
      const existingUser = await prisma.user.findUnique({
        where: { username: body.username },
      });
      if (existingUser) {
        return NextResponse.json({ detail: "Username already exists" }, { status: 409 });
      }
    }

    const hashedPassword = await hashPassword(body.password);

    const roleString = body.role ? body.role.toUpperCase() : "EMPLOYEE";
    const validRole = ["ADMIN", "CLIENT", "EMPLOYEE", "FINANCIAL_OFFICER", "PROJECT_MANAGER"].includes(roleString) ? roleString : "EMPLOYEE";

    const user = (await prisma.user.create({
      data: {
        email: body.email,
        username: body.username || body.email,
        name: name.trim(),
        password: hashedPassword,
        role: validRole,
      } as any,
    })) as any;

    await ensureUserAccount(
      String(user.id),
      String(user.role).toLowerCase() === "project_manager" ? "employee" : user.role,
      user.name
    );

    const currentUserContext = await requireAdmin();
    const { logAuditAction, AuditAction } = await import("@/lib/auditLog");
    await logAuditAction({
      userId: currentUserContext.id,
      action: AuditAction.USER_CREATED,
      resourceType: "User",
      resourceId: user.id.toString(),
      description: `User created via Admin: ${user.email} / ${user.name}`,
      status: "success",
    });

    return NextResponse.json(
      {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        full_name: user.name,
        role: normalizeRole(user.role),
        is_active: user.isActive,
        petty_cash_account_id: user.pettyCashAccountId,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to create user";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

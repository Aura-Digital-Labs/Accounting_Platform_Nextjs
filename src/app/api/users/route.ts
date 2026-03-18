import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError, hashPassword } from "@/lib/auth";
import { ensureUserAccount } from "@/lib/userAccounts";

/**
 * GET /api/users — List users (admin only), optional ?role filter
 * POST /api/users — Create user (admin only)
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const role = searchParams.get("role") as string | null;

    const whereClause = role ? { role: role as any } : {};

    const users = await prisma.user.findMany({
      where: whereClause,
      orderBy: { id: "desc" },
    });

    return NextResponse.json(
      users.map((u: any) => ({
        id: u.id,
        email: u.email,
        username: u.username,
        full_name: u.fullName,
        role: u.role,
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

    const user = await prisma.user.create({
      data: {
        email: body.email,
        username: body.username || null,
        fullName: body.full_name,
        hashedPassword,
        role: body.role || "employee",
      },
    });

    await ensureUserAccount(user.id, user.role, user.fullName);

    return NextResponse.json(
      {
        id: user.id,
        email: user.email,
        username: user.username,
        full_name: user.fullName,
        role: user.role,
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

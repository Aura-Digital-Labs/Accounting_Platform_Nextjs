import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { ensureUserAccount } from "@/lib/userAccounts";

/**
 * POST /api/auth/register
 * Register a new user. First user gets admin role.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, username, fullName, password, role } = body;

    if (!email || !fullName || !password) {
      return NextResponse.json(
        { detail: "Email, full name, and password are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { detail: "Email already exists" },
        { status: 409 }
      );
    }

    // First user becomes admin
    const userCount = await prisma.user.count();
    const assignedRole = userCount === 0 ? (role || "admin") : "employee";

    const user = await prisma.user.create({
      data: {
        email,
        username: username || null,
        fullName,
        hashedPassword: await hashPassword(password),
        role: assignedRole,
      },
    });

    await ensureUserAccount(user.id, user.role, user.fullName);

    return NextResponse.json({
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      pettyCashAccountId: user.pettyCashAccountId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Registration failed";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

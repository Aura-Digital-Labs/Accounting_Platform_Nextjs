import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";

/**
 * GET /api/accounts/closed — List closed accounts (admin only)
 */
export async function GET() {
  try {
    await requireAdmin();

    const accounts = await prisma.account.findMany({
      where: { isClosed: true },
      orderBy: { closedAt: "desc" },
    });

    return NextResponse.json(accounts);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to list closed accounts";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

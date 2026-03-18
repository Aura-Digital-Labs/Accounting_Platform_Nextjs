import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

/**
 * GET /api/bank-statements/account/[accountId]
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    await requireAuth();
    const { accountId } = await params;
    const statements = await prisma.bankStatement.findMany({
      where: { accountId: Number(accountId) },
      orderBy: { month: "desc" },
    });
    return NextResponse.json(statements);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    return NextResponse.json({ detail: "Failed to locate statements" }, { status: 500 });
  }
}

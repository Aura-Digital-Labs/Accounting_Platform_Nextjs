import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

/**
 * GET /api/bank-statements/all
 * GET  (also serves as general list if path changed, but kept as /all for parity)
 */
export async function GET() {
  try {
    await requireAuth();
    const statements = await prisma.bankStatement.findMany({
      orderBy: [{ month: "desc" }, { accountId: "asc" }],
    });
    return NextResponse.json(statements);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    return NextResponse.json({ detail: "Failed to list statements" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

function isBankStatementStorageMissing(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

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
    if (isBankStatementStorageMissing(error)) {
      return NextResponse.json([]);
    }
    return NextResponse.json({ detail: "Failed to locate statements" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
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
    if (isBankStatementStorageMissing(error)) {
      return NextResponse.json([]);
    }
    return NextResponse.json({ detail: "Failed to list statements" }, { status: 500 });
  }
}

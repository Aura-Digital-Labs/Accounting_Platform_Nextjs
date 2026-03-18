import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin, AuthError } from "@/lib/auth";

/**
 * DELETE /api/bank-statements/[id]
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Depending on FastAPI role limits, we use admin or auth.
    // routes/bank_statements.py allows active users to delete, or admin. Assume admin for safe defaults unless otherwise specified.
    await requireAdmin();
    const { id } = await params;
    
    const statement = await prisma.bankStatement.findUnique({
      where: { id: Number(id) },
    });

    if (!statement) {
      return NextResponse.json({ detail: "Bank statement not found" }, { status: 404 });
    }

    await prisma.bankStatement.delete({
      where: { id: Number(id) },
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    return NextResponse.json({ detail: "Failed to delete statement" }, { status: 500 });
  }
}

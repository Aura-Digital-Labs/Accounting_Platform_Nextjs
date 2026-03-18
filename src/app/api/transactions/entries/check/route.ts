import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";

/**
 * PATCH /api/transactions/entries/check — Mark entries as checked (admin only)
 */
export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const entryIds: number[] = body.entry_ids || body.entryIds || [];

    if (entryIds.length === 0) {
      return NextResponse.json({ checked: 0 });
    }

    await prisma.transactionEntry.updateMany({
      where: { id: { in: entryIds } },
      data: { isChecked: true },
    });

    return NextResponse.json({ checked: entryIds.length });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to check entries";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

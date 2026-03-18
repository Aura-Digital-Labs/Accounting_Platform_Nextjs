import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth";
import { accountLedger } from "@/lib/reports";

/**
 * GET /api/reports/ledger/[accountId]
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    await requireAdmin();
    const { accountId } = await params;
    const id = Number(accountId);
    const data = await accountLedger(id);
    return NextResponse.json(data);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to generate report";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

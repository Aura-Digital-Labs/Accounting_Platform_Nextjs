import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth";
import { cashFlow } from "@/lib/reports";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/reports/cash-flow
 */
export async function GET() {
  try {
    await requireAdmin();

    const cashAccounts = await prisma.account.findMany({
      where: { includeCashFlow: true },
      select: { id: true },
    });
    const cashAccountIds = cashAccounts.map((a) => a.id);

    if (cashAccountIds.length === 0) {
      return NextResponse.json({
        cash_inflow: 0.0,
        cash_outflow: 0.0,
        net_cash_flow: 0.0,
      });
    }

    const data = await cashFlow(cashAccountIds);
    return NextResponse.json(data);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to generate report";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth";
import { trialBalance } from "@/lib/reports";

/**
 * GET /api/reports/trial-balance
 */
export async function GET() {
  try {
    await requireAdmin();
    const data = await trialBalance();
    return NextResponse.json(data);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to generate report";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

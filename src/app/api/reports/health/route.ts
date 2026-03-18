import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth";
import { healthCheck } from "@/lib/reports";

/**
 * GET /api/reports/health
 */
export async function GET() {
  try {
    await requireAdmin();
    const data = await healthCheck();
    return NextResponse.json(data);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Health check failed";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

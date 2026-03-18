import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth";
import { projectSpendingVsBudget } from "@/lib/reports";

/**
 * GET /api/reports/project-vs-budget
 */
export async function GET() {
  try {
    await requireAdmin();
    const data = await projectSpendingVsBudget();
    return NextResponse.json(data);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to generate report";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

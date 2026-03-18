import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";

/**
 * GET /api/users/me — Get current user
 */
export async function GET() {
  try {
    const user = await requireAuth();

    return NextResponse.json({
      id: user.id,
      email: user.email,
      username: user.username,
      full_name: user.fullName,
      role: user.role,
      is_active: user.isActive,
      petty_cash_account_id: user.pettyCashAccountId,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to get current user";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

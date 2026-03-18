import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

/**
 * GET /api/accounts/payment-accepting — List payment-accepting accounts
 * Available to any authenticated user.
 */
export async function GET() {
  try {
    await requireAuth();

    const accounts = await prisma.account.findMany({
      where: {
        isPaymentAccepting: true,
        isClosed: false,
      },
      orderBy: { code: "asc" },
    });

    return NextResponse.json(accounts);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to list accounts";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

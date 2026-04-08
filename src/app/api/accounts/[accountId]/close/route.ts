import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";

/**
 * PATCH /api/accounts/[accountId]/close — Close an account (admin only)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    await requireAdmin();
    const { accountId } = await params;
    const id = Number(accountId);

    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) {
      return NextResponse.json({ detail: "Account not found" }, { status: 404 });
    }
    if (account.isClosed) {
      return NextResponse.json(
        { detail: "Account is already closed" },
        { status: 400 }
      );
    }

    const updated = await prisma.account.update({
      where: { id },
      data: {
        isClosed: true,
        closedAt: new Date(),
        includeCashFlow: false,
        isPaymentAccepting: false,
      },
    });

    const currentUser = await requireAdmin();
    const { logAuditAction, AuditAction } = await import("@/lib/auditLog");
    await logAuditAction({
      userId: currentUser.id,
      action: AuditAction.ACCOUNT_CLOSED,
      resourceType: "Account",
      resourceId: id.toString(),
      description: `Account ${id} (${account.code}) closed`,
      status: "success",
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to close account";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

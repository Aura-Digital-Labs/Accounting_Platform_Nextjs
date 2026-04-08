import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth, AuthError } from "@/lib/auth";

/**
 * POST /api/accounts — Create account (admin only)
 * GET  /api/accounts — List accounts with optional ?include_closed filter
 */
export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireAdmin();
    const body = await req.json();

    const exists = await prisma.account.findUnique({
      where: { code: body.code },
    });
    if (exists) {
      return NextResponse.json(
        { detail: "Account code already exists" },
        { status: 409 }
      );
    }

    const account = await prisma.account.create({
      data: {
        code: body.code,
        name: body.name,
        type: body.type,
        description: body.description || null,
        budget: body.budget || null,
        includeCashFlow: body.includeCashFlow ?? false,
        isPaymentAccepting: body.isPaymentAccepting ?? false,
        isPettyCash: body.isPettyCash ?? false,
        accountNumber: body.accountNumber || null,
        accountHolderName: body.accountHolderName || null,
        bankName: body.bankName || null,
        bankBranch: body.bankBranch || null,
      },
    });

    const { logAuditAction, AuditAction } = await import("@/lib/auditLog");
    await logAuditAction({
      userId: currentUser.id,
      action: AuditAction.ACCOUNT_CREATED,
      resourceType: "Account",
      resourceId: account.id.toString(),
      description: `Account created: ${account.code} / ${account.name}`,
      status: "success",
    });

    return NextResponse.json(account);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to create account";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const includeClosed = searchParams.get("include_closed") === "true";

    const accounts = await prisma.account.findMany({
      where: includeClosed ? {} : { isClosed: false },
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";

/**
 * GET /api/accounts/[accountId] — Get account by ID (admin only)
 * PATCH /api/accounts/[accountId] — Update account (admin only)
 */
export async function GET(
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

    return NextResponse.json(account);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to get account";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    await requireAdmin();
    const { accountId } = await params;
    const id = Number(accountId);
    const body = await req.json();

    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) {
      return NextResponse.json({ detail: "Account not found" }, { status: 404 });
    }

    if (account.isClosed) {
      return NextResponse.json(
        { detail: "Closed accounts cannot be edited" },
        { status: 400 }
      );
    }

    // Check code uniqueness if changing
    if (body.code && body.code !== account.code) {
      const exists = await prisma.account.findUnique({
        where: { code: body.code },
      });
      if (exists) {
        return NextResponse.json(
          { detail: "Account code already exists" },
          { status: 409 }
        );
      }
    }

    // Build update data, only including provided fields
    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      "code", "name", "type", "description", "budget",
      "includeCashFlow", "isPaymentAccepting", "isPettyCash",
      "accountNumber", "accountHolderName", "bankName", "bankBranch",
    ];
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const updated = await prisma.account.update({
      where: { id },
      data: updateData,
    });

    // Auto-type rules: project accounts are ASSET, EMP- accounts are LIABILITY
    let needsTypeUpdate = false;
    let newType = updated.type;

    if (updated.projectId !== null) {
      newType = "asset";
      needsTypeUpdate = updated.type !== "asset";
    } else if (typeof updated.code === "string" && updated.code.startsWith("EMP-")) {
      newType = "liability";
      needsTypeUpdate = updated.type !== "liability";
    }

    if (needsTypeUpdate) {
      const finalAccount = await prisma.account.update({
        where: { id },
        data: { type: newType },
      });
      
      const currentUser = await requireAdmin();
      const { logAuditAction, AuditAction } = await import("@/lib/auditLog");
      await logAuditAction({
        userId: currentUser.id,
        action: AuditAction.ACCOUNT_UPDATED,
        resourceType: "Account",
        resourceId: id.toString(),
        description: `Account ${id} (${account.code}) updated`,
        status: "success",
      });

      return NextResponse.json(finalAccount);
    }

    const currentUser = await requireAdmin();
    const { logAuditAction, AuditAction } = await import("@/lib/auditLog");
    await logAuditAction({
      userId: currentUser.id,
      action: AuditAction.ACCOUNT_UPDATED,
      resourceType: "Account",
      resourceId: id.toString(),
      description: `Account ${id} (${account.code}) updated`,
      status: "success",
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to update account";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

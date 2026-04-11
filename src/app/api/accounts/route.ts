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

    let finalCode = body.code;
    if (!finalCode) {
      const typePrefixes: Record<string, number> = {
        asset: 1000,
        liability: 2000,
        equity: 3000,
        revenue: 4000,
        expense: 5000,
      };

      const minCode = typePrefixes[body.type] || 6000;
      const maxCode = minCode + 999;

      const highestAccount = await prisma.account.findFirst({
        where: {
          type: body.type,
        },
        orderBy: { code: "desc" },
      });

      if (highestAccount) {
        const currentHighest = parseInt(highestAccount.code, 10);
        if (!isNaN(currentHighest) && currentHighest >= minCode && currentHighest < maxCode) {
          finalCode = (currentHighest + 1).toString();
        } else {
          // If the DB has non-numeric or strange ranges, we fallback to finding the max numeric code in the range
          const rangeAccounts = await prisma.account.findMany({
            where: { type: body.type },
            select: { code: true }
          });
          const numericCodes = rangeAccounts
            .map(a => parseInt(a.code, 10))
            .filter(n => !isNaN(n) && n >= minCode && n <= maxCode);
          
          if (numericCodes.length > 0) {
            finalCode = (Math.max(...numericCodes) + 1).toString();
          } else {
            finalCode = minCode.toString();
          }
        }
      } else {
        finalCode = minCode.toString();
      }

      // Ensure uniqueness fallback
      while (await prisma.account.findUnique({ where: { code: finalCode } })) {
        finalCode = (parseInt(finalCode, 10) + 1).toString();
      }
    } else {
      const exists = await prisma.account.findUnique({
        where: { code: finalCode },
      });
      if (exists) {
        return NextResponse.json(
          { detail: "Account code already exists" },
          { status: 409 }
        );
      }
    }

    const account = await prisma.account.create({
      data: {
        code: finalCode,
        name: body.name,
        type: body.type,
        subType: body.subType || null,
        isCurrent: body.isCurrent ?? true,
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";
import { validateBalancedEntries, AccountingError } from "@/lib/accounting";
import { Decimal } from "@prisma/client/runtime/library";
import type { EntryType } from "@prisma/client";

/**
 * GET /api/transactions/[transactionId] — Get transaction by ID (admin only)
 * PATCH /api/transactions/[transactionId] — Update transaction entries (admin only)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    await requireAdmin();
    const { transactionId } = await params;
    const id = Number(transactionId);

    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: { entries: true },
    });

    if (!transaction) {
      return NextResponse.json({ detail: "Transaction not found" }, { status: 404 });
    }

    return NextResponse.json(transaction);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    return NextResponse.json({ detail: "Failed to get transaction" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    const currentUser = await requireAdmin();
    const { transactionId } = await params;
    const id = Number(transactionId);
    const body = await req.json();

    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: { entries: true },
    });

    if (!transaction) {
      return NextResponse.json({ detail: "Transaction not found" }, { status: 404 });
    }

    if (transaction.entries.some((entry) => entry.isChecked)) {
      return NextResponse.json(
        { detail: "Checked transactions cannot be edited" },
        { status: 400 }
      );
    }

    if (
      transaction.sourceType !== null &&
      transaction.sourceType !== "manual" &&
      transaction.sourceType !== "expense"
    ) {
      return NextResponse.json(
        { detail: "This transaction type cannot be edited" },
        { status: 400 }
      );
    }

    if (!body.entries || body.entries.length < 2) {
      return NextResponse.json(
        { detail: "A transaction must have at least two entries" },
        { status: 400 }
      );
    }

    type EntryInput = { accountId: number; entryType: EntryType; amount: number };
    const entries = body.entries as EntryInput[];

    validateBalancedEntries(entries);

    // Verify all accounts exist
    const accountIds: number[] = [...new Set(entries.map((e) => e.accountId))];
    const accountCount = await prisma.account.count({
      where: { id: { in: accountIds } },
    });
    if (accountCount !== accountIds.length) {
      return NextResponse.json(
        { detail: "One or more accounts were not found" },
        { status: 404 }
      );
    }

    // Update in a transaction
    const updated = await prisma.$transaction(async (tx) => {
      // Delete old entries
      await tx.transactionEntry.deleteMany({
        where: { transactionId: id },
      });

      // Update transaction and create new entries
      const result = await tx.transaction.update({
        where: { id },
        data: {
          reference: body.reference ?? null,
          description: body.description,
          createdBy: currentUser.id,
          documentLink: body.documentLink ?? body.document_link ?? null,
          entries: {
            create: entries.map((entry) => ({
              accountId: entry.accountId,
              entryType: entry.entryType,
              amount: new Decimal(entry.amount.toFixed(2)),
            })),
          },
        },
        include: { entries: true },
      });

      // Sync expense amount if this is an expense transaction
      if (
        result.sourceType === "expense" &&
        result.sourceId !== null
      ) {
        await tx.expense.updateMany({
          where: { id: result.sourceId },
          data: { amount: new Decimal(entries[0].amount.toFixed(2)) },
        });
      }

      return result;
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    if (error instanceof AccountingError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to update transaction";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

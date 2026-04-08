import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";
import { validateBalancedEntries, AccountingError } from "@/lib/accounting";
import { Decimal } from "@prisma/client/runtime/library";
import type { EntryType } from "@prisma/client";

let hasEntryTypeEnumCache: boolean | null = null;
let needsManualTransactionEntryIdCache: boolean | null = null;

function normalizeEntryType(value: unknown): "debit" | "credit" {
  return String(value || "").toLowerCase() === "credit" ? "credit" : "debit";
}

async function hasEntryTypeEnum() {
  if (hasEntryTypeEnumCache !== null) {
    return hasEntryTypeEnumCache;
  }

  const rows = (await prisma.$queryRawUnsafe(`
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'entrytype'
    LIMIT 1
  `)) as Array<{ "?column?": number }>;

  hasEntryTypeEnumCache = rows.length > 0;
  return hasEntryTypeEnumCache;
}

async function needsManualTransactionEntryId() {
  if (needsManualTransactionEntryIdCache !== null) {
    return needsManualTransactionEntryIdCache;
  }

  const rows = (await prisma.$queryRawUnsafe(`
    SELECT column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transaction_entries'
      AND column_name = 'id'
    LIMIT 1
  `)) as Array<{ column_default: string | null }>;

  needsManualTransactionEntryIdCache = !Boolean(rows[0]?.column_default);
  return needsManualTransactionEntryIdCache;
}

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

    const hasEnumEntryType = await hasEntryTypeEnum();

    if (!hasEnumEntryType) {
      const txRows = (await prisma.$queryRaw`
        SELECT
          id,
          reference,
          description,
          created_by AS "createdBy",
          source_type AS "sourceType",
          source_id AS "sourceId",
          posted_at AS "postedAt",
          document_link AS "documentLink"
        FROM transactions
        WHERE id = ${id}
        LIMIT 1
      `) as Array<Record<string, unknown>>;

      if (txRows.length === 0) {
        return NextResponse.json({ detail: "Transaction not found" }, { status: 404 });
      }

      const entryRows = (await prisma.$queryRaw`
        SELECT
          id,
          transaction_id AS "transactionId",
          account_id AS "accountId",
          entry_type::text AS "entryType",
          amount,
          is_checked AS "isChecked"
        FROM transaction_entries
        WHERE transaction_id = ${id}
        ORDER BY id ASC
      `) as Array<Record<string, unknown>>;

      return NextResponse.json({
        ...txRows[0],
        entries: entryRows.map((entry) => ({
          ...entry,
          entryType: normalizeEntryType(entry.entryType),
        })),
      });
    }

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
    const hasEnumEntryType = await hasEntryTypeEnum();
    const manualEntryIds = hasEnumEntryType ? false : await needsManualTransactionEntryId();

    const transaction = hasEnumEntryType
      ? await prisma.transaction.findUnique({
          where: { id },
          include: { entries: true },
        })
      : (() => null)();

    const rawEntries = hasEnumEntryType
      ? []
      : ((await prisma.$queryRaw`
          SELECT
            id,
            transaction_id AS "transactionId",
            account_id AS "accountId",
            entry_type::text AS "entryType",
            amount,
            is_checked AS "isChecked"
          FROM transaction_entries
          WHERE transaction_id = ${id}
          ORDER BY id ASC
        `) as Array<{
          id: number;
          transactionId: number;
          accountId: number;
          entryType: string;
          amount: number | string;
          isChecked: boolean;
        }>);

    const rawTransaction = hasEnumEntryType
      ? null
      : ((await prisma.$queryRaw`
          SELECT
            id,
            reference,
            description,
            created_by AS "createdBy",
            source_type AS "sourceType",
            source_id AS "sourceId",
            posted_at AS "postedAt",
            document_link AS "documentLink"
          FROM transactions
          WHERE id = ${id}
          LIMIT 1
        `) as Array<{
          id: number;
          reference: string | null;
          description: string;
          createdBy: string;
          sourceType: string | null;
          sourceId: string | null;
          postedAt: Date;
          documentLink: string | null;
        }>)[0] || null;

    if (!transaction && !rawTransaction) {
      return NextResponse.json({ detail: "Transaction not found" }, { status: 404 });
    }

    const isChecked = hasEnumEntryType
      ? transaction!.entries.some((entry) => entry.isChecked)
      : rawEntries.some((entry) => entry.isChecked);

    if (isChecked) {
      return NextResponse.json(
        { detail: "Checked transactions cannot be edited" },
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
      await tx.transactionEntry.deleteMany({ where: { transactionId: id } });

      if (hasEnumEntryType) {
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

        if (result.sourceType === "expense" && result.sourceId !== null) {
          await tx.expense.updateMany({
            where: { id: result.sourceId },
            data: { amount: new Decimal(entries[0].amount.toFixed(2)) },
          });
        }

        return result;
      }

      await tx.transaction.update({
        where: { id },
        data: {
          reference: body.reference ?? null,
          description: body.description,
          createdBy: currentUser.id,
          documentLink: body.documentLink ?? body.document_link ?? null,
        },
      });

      if (manualEntryIds) {
        const entryMax = await tx.transactionEntry.aggregate({ _max: { id: true } });
        let nextEntryId = (entryMax._max.id ?? 0) + 1;

        for (const entry of entries) {
          await tx.$executeRaw`
            INSERT INTO transaction_entries (id, transaction_id, account_id, entry_type, amount, is_checked)
            VALUES (${nextEntryId++}, ${id}, ${entry.accountId}, ${String(entry.entryType)}, ${new Decimal(entry.amount.toFixed(2))}, ${false})
          `;
        }
      } else {
        for (const entry of entries) {
          await tx.$executeRaw`
            INSERT INTO transaction_entries (transaction_id, account_id, entry_type, amount, is_checked)
            VALUES (${id}, ${entry.accountId}, ${String(entry.entryType)}, ${new Decimal(entry.amount.toFixed(2))}, ${false})
          `;
        }
      }

      const transactionRows = (await tx.$queryRaw`
        SELECT
          id,
          reference,
          description,
          created_by AS "createdBy",
          source_type AS "sourceType",
          source_id AS "sourceId",
          posted_at AS "postedAt",
          document_link AS "documentLink"
        FROM transactions
        WHERE id = ${id}
        LIMIT 1
      `) as Array<Record<string, unknown>>;

      const entryRows = (await tx.$queryRaw`
        SELECT
          id,
          transaction_id AS "transactionId",
          account_id AS "accountId",
          entry_type::text AS "entryType",
          amount,
          is_checked AS "isChecked"
        FROM transaction_entries
        WHERE transaction_id = ${id}
        ORDER BY id ASC
      `) as Array<Record<string, unknown>>;

      const result: any = {
        ...(transactionRows[0] || { id }),
        entries: entryRows.map((entry) => ({
          ...entry,
          entryType: normalizeEntryType(entry.entryType),
        })),
      };

      if (String(result.sourceType || "") === "expense" && result.sourceId !== null) {
        await tx.expense.updateMany({
          where: { id: String(result.sourceId) },
          data: { amount: new Decimal(entries[0].amount.toFixed(2)) },
        });
      }

      return result;
    });

    const { logAuditAction, AuditAction } = await import("@/lib/auditLog");
    await logAuditAction({
      userId: currentUser.id,
      action: AuditAction.TRANSACTION_UPDATED,
      resourceType: "Transaction",
      resourceId: id.toString(),
      description: `Transaction ${id} updated`,
      status: "success",
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


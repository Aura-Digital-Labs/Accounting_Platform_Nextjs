import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { type EntryType } from "@prisma/client";

// ─── Types ───────────────────────────────────────────────────────

export interface TransactionEntryInput {
  accountId: number;
  entryType: EntryType;
  amount: number;
}

export interface CreateTransactionInput {
  reference?: string | null;
  description: string;
  sourceType?: string | null;
  sourceId?: string | null;
  documentLink?: string | null;
  entries: TransactionEntryInput[];
}

let needsManualIntegerIdsCache: boolean | null = null;
let hasEntryTypeEnumCache: boolean | null = null;

function normalizeEntryType(value: unknown): EntryType {
  return String(value || "").toLowerCase() === "credit" ? "credit" : "debit";
}

async function needsManualIntegerIds() {
  if (needsManualIntegerIdsCache !== null) {
    return needsManualIntegerIdsCache;
  }

  const rows = (await prisma.$queryRawUnsafe(`
    SELECT table_name, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'transactions' AND column_name = 'id')
        OR (table_name = 'transaction_entries' AND column_name = 'id'))
  `)) as Array<{ table_name: string; column_default: string | null }>;

  const map = new Map(rows.map((r) => [r.table_name, r.column_default]));
  const txHasDefault = Boolean(map.get("transactions"));
  const entryHasDefault = Boolean(map.get("transaction_entries"));

  needsManualIntegerIdsCache = !(txHasDefault && entryHasDefault);
  return needsManualIntegerIdsCache;
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

// ─── Validation ──────────────────────────────────────────────────

export class AccountingError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "AccountingError";
  }
}

/**
 * Enforce double-entry accounting: total debits must equal total credits
 * and both must be greater than zero.
 */
export function validateBalancedEntries(entries: TransactionEntryInput[]): void {
  const debitTotal = entries
    .filter((e) => e.entryType === "debit")
    .reduce((sum, e) => sum + e.amount, 0);

  const creditTotal = entries
    .filter((e) => e.entryType === "credit")
    .reduce((sum, e) => sum + e.amount, 0);

  if (
    debitTotal <= 0 ||
    creditTotal <= 0 ||
    Math.abs(debitTotal - creditTotal) > 0.001
  ) {
    throw new AccountingError(
      400,
      "Invalid transaction: total debits must equal total credits and be greater than zero"
    );
  }
}

// ─── Transaction Creation ────────────────────────────────────────

/**
 * Create a transaction with its entries in a single database transaction.
 * Validates double-entry rules and ensures all referenced accounts exist.
 * Port of services/accounting.py::create_transaction
 */
export async function createTransaction(
  data: CreateTransactionInput,
  createdBy: string
) {
  if (data.entries.length < 2) {
    throw new AccountingError(
      400,
      "A transaction must have at least two entries"
    );
  }

  validateBalancedEntries(data.entries);

  // Verify all accounts exist
  const accountIds = [...new Set(data.entries.map((e) => e.accountId))];
  const accountCount = await prisma.account.count({
    where: { id: { in: accountIds } },
  });

  if (accountCount !== accountIds.length) {
    throw new AccountingError(404, "One or more accounts were not found");
  }

  const manualIntegerIds = await needsManualIntegerIds();
  const enumEntryType = await hasEntryTypeEnum();

  if (!manualIntegerIds && enumEntryType) {
    return prisma.transaction.create({
      data: {
        reference: data.reference,
        description: data.description,
        createdBy,
        sourceType: data.sourceType || "UNKNOWN",
        sourceId: data.sourceId,
        documentLink: data.documentLink,
        entries: {
          create: data.entries.map((entry) => ({
            accountId: entry.accountId,
            entryType: entry.entryType,
            amount: new Decimal(entry.amount.toFixed(2)),
          })),
        },
      },
      include: {
        entries: true,
      },
    });
  }

  const created = await prisma.$transaction(async (tx) => {
    let transactionId: number;

    if (manualIntegerIds) {
      const txMax = await tx.transaction.aggregate({ _max: { id: true } });
      transactionId = (txMax._max.id ?? 0) + 1;

      await tx.transaction.create({
        data: {
          id: transactionId,
          reference: data.reference,
          description: data.description,
          createdBy,
          sourceType: data.sourceType || "UNKNOWN",
          sourceId: data.sourceId,
          documentLink: data.documentLink,
        },
      });
    } else {
      const createdTx = await tx.transaction.create({
        data: {
          reference: data.reference,
          description: data.description,
          createdBy,
          sourceType: data.sourceType || "UNKNOWN",
          sourceId: data.sourceId,
          documentLink: data.documentLink,
        },
        select: { id: true },
      });
      transactionId = createdTx.id;
    }

    if (manualIntegerIds) {
      const entryMax = await tx.transactionEntry.aggregate({ _max: { id: true } });
      let nextEntryId = (entryMax._max.id ?? 0) + 1;

      for (const entry of data.entries) {
        await tx.$executeRaw`
          INSERT INTO transaction_entries (id, transaction_id, account_id, entry_type, amount, is_checked)
          VALUES (${nextEntryId++}, ${transactionId}, ${entry.accountId}, ${String(entry.entryType)}, ${new Decimal(entry.amount.toFixed(2))}, ${false})
        `;
      }
    } else {
      for (const entry of data.entries) {
        await tx.$executeRaw`
          INSERT INTO transaction_entries (transaction_id, account_id, entry_type, amount, is_checked)
          VALUES (${transactionId}, ${entry.accountId}, ${String(entry.entryType)}, ${new Decimal(entry.amount.toFixed(2))}, ${false})
        `;
      }
    }

    const txRows = (await tx.$queryRaw`
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
      WHERE id = ${transactionId}
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
      WHERE transaction_id = ${transactionId}
      ORDER BY id ASC
    `) as Array<Record<string, unknown>>;

    const txRow = txRows[0] || { id: transactionId };
    return {
      ...(txRow as any),
      entries: entryRows.map((entry) => ({
        ...(entry as any),
        entryType: normalizeEntryType(entry.entryType),
      })),
    } as any;
  });

  if (!created) {
    throw new AccountingError(500, "Failed to create transaction");
  }

  return created;
}

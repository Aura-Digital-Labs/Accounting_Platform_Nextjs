import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import type { EntryType } from "@prisma/client";

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
  sourceId?: number | null;
  documentLink?: string | null;
  entries: TransactionEntryInput[];
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
  createdBy: number
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

  // Create transaction + entries atomically
  const transaction = await prisma.transaction.create({
    data: {
      reference: data.reference,
      description: data.description,
      createdBy,
      sourceType: data.sourceType,
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

  return transaction;
}

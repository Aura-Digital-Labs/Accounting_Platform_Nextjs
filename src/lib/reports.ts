import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// ─── Trial Balance ───────────────────────────────────────────────

/**
 * Aggregate debits and credits per account.
 * Port of services/reports.py::trial_balance
 */
export async function trialBalance() {
  const accounts = await prisma.account.findMany({
    orderBy: { code: "asc" },
    include: {
      entries: {
        select: {
          entryType: true,
          amount: true,
        },
      },
    },
  });

  return accounts.map((account) => {
    const debits = account.entries
      .filter((e) => e.entryType === "debit")
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const credits = account.entries
      .filter((e) => e.entryType === "credit")
      .reduce((sum, e) => sum + Number(e.amount), 0);

    return {
      account_id: account.id,
      code: account.code,
      name: account.name,
      debits: Number(debits.toFixed(2)),
      credits: Number(credits.toFixed(2)),
    };
  });
}

// ─── Account Ledger ──────────────────────────────────────────────

/**
 * Get chronological entries for an account with counterpart account info.
 * Port of services/reports.py::account_ledger
 */
export async function accountLedger(accountId: number) {
  const entries = await prisma.transactionEntry.findMany({
    where: { accountId },
    orderBy: { id: "asc" },
    include: {
      transaction: true,
      account: true,
    },
  });

  // Get all transaction IDs to find counterpart accounts
  const txIds = entries.map((e) => e.transactionId);

  // Fetch all entries for these transactions to find counterparts
  const allTxEntries = await prisma.transactionEntry.findMany({
    where: { transactionId: { in: txIds } },
    include: {
      account: {
        select: { code: true, name: true },
      },
    },
  });

  // Build counterpart map
  const grouped: Record<number, string[]> = {};
  for (const te of allTxEntries) {
    if (!grouped[te.transactionId]) grouped[te.transactionId] = [];
    grouped[te.transactionId].push(`${te.account.code} - ${te.account.name}`);
  }

  return entries.map((entry) => {
    const currentLabel = `${entry.account.code} - ${entry.account.name}`;
    const allAccounts = grouped[entry.transactionId] || [];
    const affected = allAccounts.filter((label) => label !== currentLabel);

    return {
      entry_id: entry.id,
      transaction_id: entry.transactionId,
      date: entry.transaction.postedAt.toISOString(),
      description: entry.transaction.description,
      affected_account: affected.length > 0 ? affected.join(", ") : "-",
      entry_type: entry.entryType,
      amount: Number(entry.amount),
      is_checked: entry.isChecked,
      document_link: entry.transaction.documentLink,
    };
  });
}

// ─── Project Spending vs Budget ──────────────────────────────────

/**
 * Compare project budgets against actual spending.
 * Port of services/reports.py::project_spending_vs_budget
 */
export async function projectSpendingVsBudget() {
  const accounts = await prisma.account.findMany({
    where: {
      projectId: { not: null },
      type: "expense",
    },
    include: {
      entries: {
        select: {
          entryType: true,
          amount: true,
        },
      },
    },
  });

  return accounts.map((account) => {
    const spent = account.entries
      .filter((e) => e.entryType === "debit")
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const budget = Number(account.budget || 0);

    return {
      project_id: account.projectId,
      budget,
      spent: Number(spent.toFixed(2)),
      remaining: Number((budget - spent).toFixed(2)),
    };
  });
}

// ─── Cash Flow ───────────────────────────────────────────────────

/**
 * Calculate cash inflow, outflow, and net for specified accounts.
 * Port of services/reports.py::cash_flow
 */
export async function cashFlow(cashAccountIds: number[]) {
  const entries = await prisma.transactionEntry.findMany({
    where: { accountId: { in: cashAccountIds } },
  });

  const inflow = entries
    .filter((e) => e.entryType === "debit")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const outflow = entries
    .filter((e) => e.entryType === "credit")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  return {
    cash_inflow: Number(inflow.toFixed(2)),
    cash_outflow: Number(outflow.toFixed(2)),
    net_cash_flow: Number((inflow - outflow).toFixed(2)),
  };
}

// ─── Health Check ────────────────────────────────────────────────

/**
 * Comprehensive accounting health check.
 * Port of services/reports.py::health_check
 */
export async function healthCheck() {
  const tbData = await trialBalance();

  const accounts = await prisma.account.findMany();

  const totals = {
    assets: 0,
    liabilities: 0,
    equity: 0,
    revenue: 0,
    expenses: 0,
  };

  const tbMap = new Map(tbData.map((row) => [row.account_id, row]));

  for (const account of accounts) {
    const tbRow = tbMap.get(account.id) || { debits: 0, credits: 0 };
    const debits = tbRow.debits;
    const credits = tbRow.credits;

    switch (account.type) {
      case "asset":
        totals.assets += debits - credits;
        break;
      case "liability":
        totals.liabilities += credits - debits;
        break;
      case "equity":
        totals.equity += credits - debits;
        break;
      case "revenue":
        totals.revenue += credits - debits;
        break;
      case "expense":
        totals.expenses += debits - credits;
        break;
    }
  }

  const profit = totals.revenue - totals.expenses;
  const updatedEquity = totals.equity + profit;

  const totalDebits = tbData.reduce((sum, row) => sum + row.debits, 0);
  const totalCredits = tbData.reduce((sum, row) => sum + row.credits, 0);

  return {
    status: "ok",
    assets: Number(totals.assets.toFixed(2)),
    liabilities: Number(totals.liabilities.toFixed(2)),
    equity: Number(totals.equity.toFixed(2)),
    revenue: Number(totals.revenue.toFixed(2)),
    expenses: Number(totals.expenses.toFixed(2)),
    profit: Number(profit.toFixed(2)),
    updated_equity: Number(updatedEquity.toFixed(2)),
    total_debits: Number(totalDebits.toFixed(2)),
    total_credits: Number(totalCredits.toFixed(2)),
    double_entry_balanced: Math.abs(totalDebits - totalCredits) < 0.01,
    accounting_equation_balanced:
      Math.abs(totals.assets - (totals.liabilities + updatedEquity)) < 0.01,
  };
}

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

function normalizeEntryType(value: unknown): "debit" | "credit" | null {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "debit") return "debit";
  if (normalized === "credit") return "credit";
  return null;
}

// ─── Trial Balance ───────────────────────────────────────────────

/**
 * Aggregate debits and credits per account.
 * Port of services/reports.py::trial_balance
 */
export async function trialBalance() {
  const rows = (await prisma.$queryRawUnsafe(`
    SELECT
      a.id AS account_id,
      a.code,
      a.name,
      te.entry_type::text AS entry_type,
      te.amount
    FROM accounts a
    LEFT JOIN transaction_entries te ON te.account_id = a.id
    ORDER BY a.code ASC
  `)) as Array<{
    account_id: number;
    code: string;
    name: string;
    entry_type: string | null;
    amount: number | string | null;
  }>;

  const map = new Map<number, { account_id: number; code: string; name: string; debits: number; credits: number }>();

  for (const row of rows) {
    if (!map.has(row.account_id)) {
      map.set(row.account_id, {
        account_id: row.account_id,
        code: row.code,
        name: row.name,
        debits: 0,
        credits: 0,
      });
    }

    const entryType = normalizeEntryType(row.entry_type);
    const amount = Number(row.amount || 0);
    const target = map.get(row.account_id)!;

    if (entryType === "debit") target.debits += amount;
    if (entryType === "credit") target.credits += amount;
  }

  return Array.from(map.values()).map((row) => ({
    ...row,
    debits: Number(row.debits.toFixed(2)),
    credits: Number(row.credits.toFixed(2)),
  }));
}

// ─── Account Ledger ──────────────────────────────────────────────

/**
 * Get chronological entries for an account with counterpart account info.
 * Port of services/reports.py::account_ledger
 */
export async function accountLedger(accountId: number) {
  const entries = (await prisma.$queryRawUnsafe(`
    SELECT
      te.id AS entry_id,
      te.transaction_id,
      t.posted_at,
      t.description,
      t.document_link,
      te.entry_type::text AS entry_type,
      te.amount,
      te.is_checked,
      a.code AS account_code,
      a.name AS account_name
    FROM transaction_entries te
    JOIN transactions t ON t.id = te.transaction_id
    JOIN accounts a ON a.id = te.account_id
    WHERE te.account_id = ${accountId}
    ORDER BY te.id ASC
  `)) as Array<{
    entry_id: number;
    transaction_id: number;
    posted_at: Date | string;
    description: string;
    document_link: string | null;
    entry_type: string;
    amount: number | string;
    is_checked: boolean;
    account_code: string;
    account_name: string;
  }>;

  const txIds = [...new Set(entries.map((e) => e.transaction_id))];
  if (txIds.length === 0) {
    return [];
  }

  const allTxEntries = (await prisma.$queryRawUnsafe(`
    SELECT te.transaction_id, a.code, a.name, te.is_checked
    FROM transaction_entries te
    JOIN accounts a ON a.id = te.account_id
    WHERE te.transaction_id IN (${txIds.join(",")})
  `)) as Array<{ transaction_id: number; code: string; name: string; is_checked: boolean }>;

  const grouped: Record<number, string[]> = {};
  const hasCheckedMap: Record<number, boolean> = {};
  for (const te of allTxEntries) {
    if (!grouped[te.transaction_id]) grouped[te.transaction_id] = [];
    grouped[te.transaction_id].push(`${te.code} - ${te.name}`);
    if (te.is_checked) hasCheckedMap[te.transaction_id] = true;
  }

  return entries.map((entry) => {
    const currentLabel = `${entry.account_code} - ${entry.account_name}`;
    const allAccounts = grouped[entry.transaction_id] || [];
    const affected = allAccounts.filter((label) => label !== currentLabel);

    return {
      entry_id: entry.entry_id,
      transaction_id: entry.transaction_id,
      date: new Date(entry.posted_at).toISOString(),
      description: entry.description,
      affected_account: affected.length > 0 ? affected.join(", ") : "-",
      entry_type: normalizeEntryType(entry.entry_type) || "debit",
      amount: Number(entry.amount),
      is_checked: entry.is_checked,
      is_transaction_checked: hasCheckedMap[entry.transaction_id] || false,
      document_link: entry.document_link,
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
  if (cashAccountIds.length === 0) {
    return {
      cash_inflow: 0,
      cash_outflow: 0,
      net_cash_flow: 0,
    };
  }

  const entries = (await prisma.$queryRawUnsafe(`
    SELECT entry_type::text AS entry_type, amount
    FROM transaction_entries
    WHERE account_id IN (${cashAccountIds.join(",")})
  `)) as Array<{ entry_type: string; amount: number | string }>;

  const inflow = entries
    .filter((e) => normalizeEntryType(e.entry_type) === "debit")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const outflow = entries
    .filter((e) => normalizeEntryType(e.entry_type) === "credit")
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

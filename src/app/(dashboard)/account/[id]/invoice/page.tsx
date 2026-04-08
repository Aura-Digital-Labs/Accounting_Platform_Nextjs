import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin, AuthError } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type InvoiceRow = {
  date: Date;
  description: string;
  payment: number;
  finalExpense: number;
};

type LedgerEntryRow = {
  transactionId: number;
  postedAt: Date;
  description: string;
  sourceType: string | null;
  sourceId: string | null;
  entryType: string;
  amount: number | string;
  finalExpenseAmount: number | null;
};

type LinkedProjectRow = {
  id: string;
  name: string;
  budget: number | string;
  code: string | null;
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default async function GenerateInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireAdmin();
  } catch (error: unknown) {
    if (error instanceof AuthError && error.status === 401) {
      redirect("/login");
    }
    redirect("/");
  }

  const { id } = await params;
  const accountId = Number(id);

  if (!Number.isFinite(accountId) || accountId <= 0) {
    redirect("/");
  }

  const currentUser = await requireAdmin();
  const { logAuditAction, AuditAction } = await import("@/lib/auditLog");
  await logAuditAction({
    userId: currentUser.id,
    action: AuditAction.INVOICE_GENERATED,
    resourceType: "Account",
    resourceId: accountId.toString(),
    description: `Generated invoice view for account ${accountId}`,
    status: "success",
  });

  const linkedProjects = (await prisma.$queryRaw(Prisma.sql`
    SELECT
      p.id,
      p.name,
      p.budget,
      p.code
    FROM "Project" p
    WHERE p.account_id = ${accountId}
    LIMIT 1
  `)) as LinkedProjectRow[];

  const project = linkedProjects[0] || null;

  if (!project) {
    return (
      <section className={styles.page}>
        <article className={styles.card}>
          <h1 className={styles.title}>Generate Invoice</h1>
          <p className={styles.empty}>This account is not linked to a project.</p>
          <div className={styles.linksRow}>
            <Link href={`/account/${accountId}`} className={styles.linkButton}>
              Back to Account Transactions
            </Link>
            <Link href="/" className={styles.linkButtonSecondary}>
              Back to Dashboard
            </Link>
          </div>
        </article>
      </section>
    );
  }

  const ledgerEntries = (await prisma.$queryRaw(Prisma.sql`
    SELECT
      t.id AS "transactionId",
      t.posted_at AS "postedAt",
      COALESCE(
        NULLIF(BTRIM(cp.title), ''),
        NULLIF(BTRIM(cp.description), ''),
        NULLIF(BTRIM(e.description), ''),
        NULLIF(BTRIM(t.description), ''),
        'Transaction'
      ) AS description,
      t.source_type AS "sourceType",
      t.source_id AS "sourceId",
      te.entry_type::text AS "entryType",
      te.amount,
      e.final_expense_amount AS "finalExpenseAmount"
    FROM transactions t
    INNER JOIN transaction_entries te ON te.transaction_id = t.id
    LEFT JOIN expenses e ON COALESCE(t.source_type, '') ILIKE 'expense%' AND t.source_id = e.id::text
    LEFT JOIN "ClientPayment" cp ON COALESCE(t.source_type, '') = 'client_payment' AND t.source_id = cp.id
    WHERE te.account_id = ${accountId}
      AND COALESCE(t.source_type, '') <> 'project_budget'
      AND COALESCE(t.description, '') NOT ILIKE 'Estimated Budget'
      AND COALESCE(t.description, '') NOT ILIKE '%initial budget funding%'
      AND COALESCE(t.source_type, '') NOT IN ('expense_profit', 'expense_group_item_profit')
      AND NOT EXISTS (
        SELECT 1
        FROM transaction_entries te_ex
        INNER JOIN accounts a_ex ON a_ex.id = te_ex.account_id
        WHERE te_ex.transaction_id = t.id
          AND UPPER(COALESCE(a_ex.code, '')) = 'COMP-PROFIT'
      )
    ORDER BY t.posted_at ASC, t.id ASC, te.id ASC
  `)) as LedgerEntryRow[];

  const groupedRows = new Map<string, { date: Date; description: string; payment: number; finalExpense: number; order: number }>();

  ledgerEntries.forEach((entry, index) => {
    const normalizedSourceType = String(entry.sourceType || "").toLowerCase();
    const isExpenseLike = normalizedSourceType.startsWith("expense");
    const key = `tx-${entry.transactionId}-${index}`;

    if (!groupedRows.has(key)) {
      groupedRows.set(key, {
        date: new Date(entry.postedAt),
        description: String(entry.description || "Transaction").trim() || "Transaction",
        payment: 0,
        finalExpense: 0,
        order: index,
      });
    }

    const row = groupedRows.get(key)!;
    const amount = Number(entry.amount || 0);
    const normalizedEntryType = String(entry.entryType || "").toLowerCase();

    if (isExpenseLike) {
      const resolvedFinalExpense =
        entry.finalExpenseAmount !== null && entry.finalExpenseAmount !== undefined
          ? Number(entry.finalExpenseAmount)
          : Math.abs(amount);
      row.finalExpense = Number(resolvedFinalExpense.toFixed(2));
      return;
    }

    if (normalizedEntryType === "debit") {
      row.finalExpense = Number((row.finalExpense + amount).toFixed(2));
    } else {
      row.payment = Number((row.payment + amount).toFixed(2));
    }
  });

  const orderedRows = Array.from(groupedRows.values())
    .sort((a, b) => {
      const dateDiff = a.date.getTime() - b.date.getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.order - b.order;
    })
    .map(({ date, description, payment, finalExpense }) => ({
      date,
      description,
      payment,
      finalExpense,
    }));

  const totalBudget = Number(project.budget);
  const rows: InvoiceRow[] = orderedRows;
  const totalPayments = rows.reduce((sum, row) => sum + Number(row.payment || 0), 0);
  const totalExpenses = rows.reduce((sum, row) => sum + Number(row.finalExpense || 0), 0);
  const remainingBalance = Number((totalBudget + totalExpenses - totalPayments).toFixed(2));
  const generatedDate = new Date();

  return (
    <section className={styles.page}>
      <article className={styles.card}>
        <h1 className={styles.title}>Project Invoice</h1>
        <div className={styles.metaGrid}>
          <div>
            <p className={styles.metaLabel}>Project Name</p>
            <p className={styles.metaValue}>
              {project.code ? `${project.code} - ` : ""}{project.name}
            </p>
          </div>
          <div>
            <p className={styles.metaLabel}>Generated Date</p>
            <p className={styles.metaValue}>{formatDate(generatedDate)}</p>
          </div>
          <div>
            <p className={styles.metaLabel}>Total Budget</p>
            <p className={styles.metaValue}>{formatCurrency(totalBudget)}</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className={styles.empty}>No approved payments or approved expenses found for this project.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Payment</th>
                  <th>Final Expenses</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.description}-${index}`}>
                    <td>{formatDate(row.date)}</td>
                    <td>{row.description}</td>
                    <td>{row.payment > 0 ? formatCurrency(row.payment) : "-"}</td>
                    <td>{row.finalExpense > 0 ? formatCurrency(row.finalExpense) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <p className={styles.metaLabel}>Remaining Balance</p>
            <p className={styles.summaryValue}>{formatCurrency(remainingBalance)}</p>
          </div>
        </div>

        <div className={styles.linksRow}>
          <Link href={`/account/${accountId}`} className={styles.linkButton}>
            Back to Account Transactions
          </Link>
          <Link href="/" className={styles.linkButtonSecondary}>
            Back to Dashboard
          </Link>
        </div>
      </article>
    </section>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin, AuthError } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import styles from "./page.module.css";
import LogInvoiceView from "./LogInvoiceView";
import DownloadInvoiceButton from "./DownloadInvoiceButton";

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
  financeStatus: string | null;
  invoiceCount: number;
  lastInvoiceNo: string | null;
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

  const linkedProjects = (await prisma.$queryRaw(Prisma.sql`
    SELECT
      p.id,
      p.name,
      p.budget,
      p.code,
      p.finance_status as "financeStatus",
      p.invoice_count as "invoiceCount",
      p.last_invoice_no as "lastInvoiceNo"
    FROM "Project" p
    WHERE p.account_id = ${accountId}
    LIMIT 1
  `)) as LinkedProjectRow[];

  const project = linkedProjects[0] || null;

  if (!project) {
    return (
      <section className={styles.page}>
        <LogInvoiceView accountId={accountId} />
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

    if (normalizedSourceType === "client_payment" || normalizedEntryType === "credit") {
      // Only count actual client payments as "payment" to reduce wrong totals from internal credits.
      if (normalizedSourceType === "client_payment") {
        row.payment = Number((row.payment + amount).toFixed(2));
      }
    } else if (normalizedEntryType === "debit") {
      // Expenses or internal debits
      row.finalExpense = Number((row.finalExpense + amount).toFixed(2));
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

  const isDownloadDisabled = project.financeStatus !== "Ready to Deliver" && project.financeStatus !== "Payment Required";

  const expenseItems = orderedRows
    .filter(r => r.finalExpense > 0)
    .map(r => ({
      description: r.description,
      qty: "-",
      unitPrice: "-",
      totalAmount: r.finalExpense,
    }));

  const paymentItems = orderedRows
    .filter(r => r.payment > 0)
    .map((r, i) => ({
      paymentDate: formatDate(r.date),
      amountPaid: r.payment,
      paymentMethod: "Bank Transfer",
      reference: `TXN-${i + 1}`,
      notes: r.description,
    }));

  const totalExpenseSum = expenseItems.reduce((acc, curr) => acc + curr.totalAmount, 0);
  const subtotalRaw = totalBudget + totalExpenseSum;
  const taxRaw = 0; // Tax or additional charges if requested later
  const grandTotalRaw = subtotalRaw + taxRaw;
  const totalPaymentDoneRaw = paymentItems.reduce((acc, curr) => acc + curr.amountPaid, 0);
  const remainingPaymentDueRaw = grandTotalRaw - totalPaymentDoneRaw;

  const projLetters = project.name.replace(/[^a-zA-Z]/g, "").substring(0, 3).toUpperCase().padEnd(3, 'X');
  // Use accountId as the numeric identifier since Project ID is a hash
  const projNum = String(accountId).padStart(3, '0');
  const nextCount = (project.invoiceCount || 0) + 1;
  const countStr = String(nextCount).padStart(2, '0');
  const invoiceNo = `INV${projNum}${projLetters}-${countStr}`;

  const invoiceData = {
    projectId: project.id,
    invoiceNo,
    projectNameWithCode: project.code ? `${project.code} - ${project.name}` : project.name,
    projectName: project.name,
    generatedDate: formatDate(generatedDate),
    initialBudget: formatCurrency(totalBudget),
    totals: {
      subtotal: formatCurrency(subtotalRaw),
      tax: formatCurrency(taxRaw),
      grandTotal: formatCurrency(grandTotalRaw),
      totalPaymentDone: formatCurrency(totalPaymentDoneRaw),
      remainingPaymentDue: formatCurrency(remainingPaymentDueRaw),
    },
    expenses: [
      { description: "Initial Budget", qty: "1", unitPrice: formatCurrency(totalBudget), totalAmount: formatCurrency(totalBudget) },
      ...expenseItems.map(e => ({
        description: e.description,
        qty: e.qty,
        unitPrice: e.unitPrice,
        totalAmount: formatCurrency(e.totalAmount)
      }))
    ],
    payments: paymentItems.map(p => ({
      paymentDate: p.paymentDate,
      amountPaid: formatCurrency(p.amountPaid),
      paymentMethod: p.paymentMethod,
      reference: p.reference,
      notes: p.notes,
    })),
    // Keep old rows for the screen display
    rows: rows.map(r => ({
      date: formatDate(r.date),
      description: r.description,
      payment: r.payment > 0 ? formatCurrency(r.payment) : "-",
      finalExpense: r.finalExpense > 0 ? formatCurrency(r.finalExpense) : "-",
    })),
    totalBudget: formatCurrency(totalBudget),
    remainingBalance: formatCurrency(remainingBalance),
  };

  return (
    <section className={styles.page}>
      <LogInvoiceView accountId={accountId} />
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
            <p className={styles.metaLabel}>Invoice No</p>
            <p className={styles.metaValue}>{invoiceNo}</p>
          </div>
          <div>
            <p className={styles.metaLabel}>Total Budget</p>
            <p className={styles.metaValue}>{formatCurrency(totalBudget)}</p>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <h2 className={styles.sectionTitle}>Project &amp; Billing Details</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Description</th>
                <th>Quantity / Unit</th>
                <th>Unit Price</th>
                <th style={{ textAlign: "right" }}>Total Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoiceData.expenses.map((row, index) => (
                <tr key={`exp-${index}`}>
                  <td>{row.description}</td>
                  <td>{row.qty}</td>
                  <td>{row.unitPrice}</td>
                  <td style={{ textAlign: "right", fontWeight: "bold" }}>{row.totalAmount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.summarySection}>
          <div className={styles.summaryRow}>
            <span>Subtotal:</span>
            <span>{invoiceData.totals.subtotal}</span>
          </div>
          <div className={styles.summaryRow}>
            <span>Tax / Additional:</span>
            <span>{invoiceData.totals.tax}</span>
          </div>
          <div className={`${styles.summaryRow} ${styles.summaryBold}`}>
            <span>Grand Total:</span>
            <span>{invoiceData.totals.grandTotal}</span>
          </div>
          <div className={styles.summaryRow}>
            <span>Total Payment Done:</span>
            <span>{invoiceData.totals.totalPaymentDone}</span>
          </div>
          <div className={`${styles.summaryRow} ${styles.summaryHighlight}`}>
            <span>Remaining Due:</span>
            <span>{invoiceData.totals.remainingPaymentDue}</span>
          </div>
        </div>

        <div className={styles.tableWrap} style={{ marginTop: "2rem" }}>
          <h2 className={styles.sectionTitle}>Payment History</h2>
          {invoiceData.payments.length === 0 ? (
            <p className={styles.empty}>No payments recorded yet.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount Paid</th>
                  <th>Payment Method</th>
                  <th>Reference</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {invoiceData.payments.map((row, index) => (
                  <tr key={`pay-${index}`}>
                    <td>{row.paymentDate}</td>
                    <td style={{ fontWeight: "bold" }}>{row.amountPaid}</td>
                    <td>{row.paymentMethod}</td>
                    <td>{row.reference}</td>
                    <td>{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className={styles.linksRow}>
          <Link href={`/account/${accountId}`} className={styles.linkButtonSecondary}>
            Back to Account Transactions
          </Link>
          <Link href="/" className={styles.linkButtonSecondary}>
            Back to Dashboard
          </Link>
          <DownloadInvoiceButton
            disabled={isDownloadDisabled}
            invoiceData={invoiceData}
          />
        </div>
      </article>
    </section>
  );
}

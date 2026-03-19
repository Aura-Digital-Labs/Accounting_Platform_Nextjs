import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type InvoiceRow = {
  date: Date;
  description: string;
  payment: number;
  expense: number;
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
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

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      linkedProject: {
        select: {
          id: true,
          name: true,
          budget: true,
          code: true,
        },
      },
    },
  });

  if (!account || !account.linkedProject) {
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

  const project = account.linkedProject;
  const [payments, expenses] = await Promise.all([
    prisma.clientPayment.findMany({
      where: {
        projectId: project.id,
        status: "approved",
      },
      select: {
        description: true,
        amount: true,
        paymentDate: true,
      },
      orderBy: { paymentDate: "asc" },
    }),
    prisma.expense.findMany({
      where: {
        projectId: project.id,
        status: "approved",
      },
      select: {
        description: true,
        amount: true,
        finalExpenseAmount: true,
        expenseDate: true,
      },
      orderBy: { expenseDate: "asc" },
    }),
  ]);

  const paymentRows: InvoiceRow[] = payments.map((payment) => ({
    date: payment.paymentDate,
    description: (payment.description || "Payment").trim(),
    payment: Number(payment.amount),
    expense: 0,
  }));

  const expenseRows: InvoiceRow[] = expenses.map((expense) => ({
    date: expense.expenseDate,
    description: (expense.description || "Expense").trim(),
    payment: 0,
    expense: Number(expense.finalExpenseAmount ?? expense.amount),
  }));

  const rows = [...paymentRows, ...expenseRows].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  const totalPayments = Number(
    paymentRows.reduce((sum, row) => sum + row.payment, 0).toFixed(2)
  );
  const totalExpenses = Number(
    expenseRows.reduce((sum, row) => sum + row.expense, 0).toFixed(2)
  );
  const totalBudget = Number(project.budget);
  const remainder = Number((totalBudget + totalExpenses - totalPayments).toFixed(2));
  const generatedDate = new Date();

  return (
    <section className={styles.page}>
      <article className={styles.card}>
        <h1 className={styles.title}>Project Invoice</h1>
        <div className={styles.metaGrid}>
          <div>
            <p className={styles.metaLabel}>Project Name</p>
            <p className={styles.metaValue}>
              {project.code} - {project.name}
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
          <p className={styles.empty}>No approved payments or expenses found for this project.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Payment</th>
                  <th>Expenses</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.description}-${index}`}>
                    <td>{`${formatDate(row.date)} - ${row.description}`}</td>
                    <td>{row.payment > 0 ? formatCurrency(row.payment) : "-"}</td>
                    <td>{row.expense > 0 ? formatCurrency(row.expense) : "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td>{formatCurrency(totalPayments)}</td>
                  <td>{formatCurrency(totalExpenses)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <p className={styles.metaLabel}>Remainder</p>
            <p className={styles.summaryValue}>{formatCurrency(remainder)}</p>
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

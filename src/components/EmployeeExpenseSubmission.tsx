"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./EmployeeExpenseSubmission.module.css";

type Project = {
  id: number;
  code: string;
  name: string;
};

type ExpenseEntry = {
  rowId: number;
  projectId: string;
  amount: string;
};

const INITIAL_ENTRY: ExpenseEntry = {
  rowId: 1,
  projectId: "",
  amount: "",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

async function parseApiError(res: Response) {
  try {
    const payload = (await res.json()) as { detail?: string };
    return payload.detail || "Request failed";
  } catch {
    return "Request failed";
  }
}

export default function EmployeeExpenseSubmission() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [description, setDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [entries, setEntries] = useState<ExpenseEntry[]>([INITIAL_ENTRY]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const [loadingProjects, setLoadingProjects] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadProjects = async () => {
      setLoadingProjects(true);
      try {
        const res = await fetch("/api/projects", {
          cache: "no-store",
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error(await parseApiError(res));
        }

        const payload = (await res.json()) as Project[];
        if (mounted) {
          setProjects(payload);
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load projects");
        }
      } finally {
        if (mounted) {
          setLoadingProjects(false);
        }
      }
    };

    void loadProjects();

    return () => {
      mounted = false;
    };
  }, []);

  const totalExpense = useMemo(
    () =>
      entries.reduce((sum, entry) => {
        const parsed = Number(entry.amount);
        return sum + (Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
      }, 0),
    [entries]
  );

  const updateEntry = (rowId: number, field: "projectId" | "amount", value: string) => {
    setEntries((prev) =>
      prev.map((entry) => (entry.rowId === rowId ? { ...entry, [field]: value } : entry))
    );
  };

  const addAnotherExpense = () => {
    setEntries((prev) => [
      ...prev,
      {
        rowId: prev.length === 0 ? 1 : Math.max(...prev.map((entry) => entry.rowId)) + 1,
        projectId: "",
        amount: "",
      },
    ]);
  };

  const submitExpenses = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const cleanDescription = description.trim();
    if (!cleanDescription) {
      setError("Description is required.");
      return;
    }

    if (!expenseDate) {
      setError("Date is required.");
      return;
    }

    const validEntries = entries.filter(
      (entry) => entry.projectId && Number.isFinite(Number(entry.amount)) && Number(entry.amount) > 0
    );

    if (validEntries.length === 0) {
      setError("Add at least one expense with a project and amount.");
      return;
    }

    setSubmitting(true);
    try {
      for (const entry of validEntries) {
        const formData = new FormData();
        formData.append("project_id", entry.projectId);
        formData.append("description", cleanDescription);
        formData.append("amount", Number(entry.amount).toFixed(2));
        formData.append("expense_date", expenseDate);
        formData.append("payment_source", "personal");
        if (receiptFile) {
          formData.append("receipt_file", receiptFile);
        }

        const res = await fetch("/api/expenses", {
          method: "POST",
          credentials: "include",
          body: formData,
        });

        if (!res.ok) {
          throw new Error(await parseApiError(res));
        }
      }

      setSuccess(`${validEntries.length} expense${validEntries.length > 1 ? "s" : ""} submitted.`);
      setDescription("");
      setExpenseDate("");
      setEntries([INITIAL_ENTRY]);
      setReceiptFile(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to submit expenses");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.pageBg}>
      <section className={styles.card}>
        <header className={styles.header}>
          <h1 className={styles.title}>Submit Expense</h1>
          <p className={styles.subtitle}>Add one or more expenses to your projects</p>
        </header>

        {error && <p className={styles.errorText}>{error}</p>}
        {success && <p className={styles.successText}>{success}</p>}

        <form onSubmit={submitExpenses} className={styles.form}>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Common Details</h2>
            <label className={styles.label} htmlFor="expense-description">
              Description
            </label>
            <input
              id="expense-description"
              className={styles.input}
              placeholder="What are these expenses for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />

            <label className={styles.label} htmlFor="expense-date">
              Date
            </label>
            <input
              id="expense-date"
              className={styles.input}
              type="date"
              placeholder="mm/dd/yyyy"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              required
            />
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Expenses</h2>

            {entries.map((entry, index) => (
              <div key={entry.rowId} className={styles.expenseRow}>
                <div>
                  <label className={styles.label} htmlFor={`project-${entry.rowId}`}>
                    Project {entries.length > 1 ? index + 1 : ""}
                  </label>
                  <select
                    id={`project-${entry.rowId}`}
                    className={styles.input}
                    value={entry.projectId}
                    onChange={(e) => updateEntry(entry.rowId, "projectId", e.target.value)}
                    required
                    disabled={loadingProjects}
                  >
                    <option value="">{loadingProjects ? "Loading projects..." : "Select Project"}</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.code} - {project.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={styles.label} htmlFor={`amount-${entry.rowId}`}>
                    Expense Amount
                  </label>
                  <input
                    id={`amount-${entry.rowId}`}
                    className={styles.input}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={entry.amount}
                    onChange={(e) => updateEntry(entry.rowId, "amount", e.target.value)}
                    required
                  />
                </div>
              </div>
            ))}

            <button type="button" className={styles.secondaryButton} onClick={addAnotherExpense}>
              + Add Another Expense
            </button>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Receipt (Optional)</h2>
            <label className={styles.label} htmlFor="receipt-file">
              Upload Receipt
            </label>
            <input
              id="receipt-file"
              className={styles.input}
              type="file"
              onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
            />
          </div>

          <div className={styles.totalRow}>
            <span className={styles.totalLabel}>Total Expense</span>
            <span className={styles.totalValue}>{formatCurrency(totalExpense)}</span>
          </div>

          <button type="submit" className={styles.primaryButton} disabled={submitting || loadingProjects}>
            {submitting ? "Submitting..." : "Submit"}
          </button>
        </form>
      </section>
    </div>
  );
}
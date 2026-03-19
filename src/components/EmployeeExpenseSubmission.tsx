"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import styles from "./EmployeeExpenseSubmission.module.css";

type UserRole = "employee" | "project_manager";

type Project = {
  id: number;
  code: string;
  name: string;
};

type CurrentUser = {
  petty_cash_account_id: number | null;
};

type PendingExpense = {
  id: number;
  project_id: number;
  project_name: string;
  employee_name: string;
  description: string;
  amount: number;
  expense_date: string;
  final_expense_amount: number | null;
  pm_approval_notes: string | null;
  status: string;
};

type PendingPayment = {
  id: number;
  project_name: string;
  client_name: string;
  amount: number;
  payment_date: string;
  status: string;
};

type PMReviewStatus = "Pending" | "In Review";

type PendingExpenseLine = {
  id: number;
  expenseId: number;
  project: string;
  amountOriginal: number;
  amountFinal: number;
  notes: string | null;
};

type PendingExpenseGroup = {
  id: number;
  date: string;
  employer: string;
  description: string;
  pmReviewStatus: PMReviewStatus;
  lineItems: PendingExpenseLine[];
};

type ReviewTarget = {
  groupId: number;
  expenseId: number;
  project: string;
  date: string;
  employer: string;
  description: string;
  originalAmount: number;
  currentFinalAmount: number;
  currentNotes: string | null;
};

const expenseSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(500),
  expenseDate: z.string().min(1, "Expense date is required"),
  paymentSource: z.enum(["personal", "petty_cash"]),
  lines: z
    .array(
      z.object({
        projectId: z.coerce.number().int().positive("Project is required"),
        amount: z.coerce.number().positive("Amount must be greater than zero"),
      })
    )
    .min(1, "Add at least one expense line"),
});

type ExpenseFormInput = z.input<typeof expenseSchema>;
type ExpenseFormOutput = z.output<typeof expenseSchema>;

async function parseApiError(res: Response) {
  try {
    const payload = (await res.json()) as { detail?: string };
    return payload.detail || "Request failed";
  } catch {
    return "Request failed";
  }
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return parsed.toLocaleDateString();
}

function statusClassName(status: string) {
  if (status === "approved" || status === "approved_by_pm") {
    return styles.statusApproved;
  }
  if (status === "rejected" || status === "rejected_by_pm") {
    return styles.statusRejected;
  }
  return styles.statusPending;
}

function statusLabel(status: string) {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function EmployeeExpenseSubmission({ role }: { role: UserRole }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [supportingDocument, setSupportingDocument] = useState<File | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [fileError, setFileError] = useState("");
  const supportingDocumentInputRef = useRef<HTMLInputElement | null>(null);

  const [canUsePettyCash, setCanUsePettyCash] = useState(false);
  const [pendingExpenses, setPendingExpenses] = useState<PendingExpense[]>([]);
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [reviewFinalAmount, setReviewFinalAmount] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<ExpenseFormInput, unknown, ExpenseFormOutput>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      description: "",
      expenseDate: "",
      paymentSource: "personal",
      lines: [{ projectId: "", amount: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "lines",
  });

  const watchedLines = watch("lines");
  const totalAmount = useMemo(
    () =>
      watchedLines.reduce((sum, line) => {
        const parsed = Number(line.amount);
        return sum + (Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
      }, 0),
    [watchedLines]
  );

  const projectOptions = projects.map((project) => ({
    value: String(project.id),
    label: `${project.code} - ${project.name}`,
  }));

  const paymentSourceOptions = [
    { value: "personal", label: "Personal account" },
    ...(canUsePettyCash ? [{ value: "petty_cash", label: "Petty Cash account" }] : []),
  ];

  const groupedPendingExpenses = useMemo<PendingExpenseGroup[]>(() => {
    const groups = new Map<string, PendingExpenseGroup>();

    for (const expense of pendingExpenses) {
      const key = `${expense.employee_name}|${expense.expense_date}|${expense.description}`;
      const existing = groups.get(key);

      const line: PendingExpenseLine = {
        id: expense.id,
        expenseId: expense.id,
        project: expense.project_name,
        amountOriginal: Number(expense.amount),
        amountFinal: Number(expense.final_expense_amount ?? expense.amount),
        notes: expense.pm_approval_notes,
      };

      if (!existing) {
        groups.set(key, {
          id: expense.id,
          date: expense.expense_date,
          employer: expense.employee_name,
          description: expense.description,
          pmReviewStatus: expense.status === "approved_by_pm" ? "In Review" : "Pending",
          lineItems: [line],
        });
        continue;
      }

      existing.lineItems.push(line);
      if (expense.status === "approved_by_pm") {
        existing.pmReviewStatus = "In Review";
      }
    }

    return Array.from(groups.values());
  }, [pendingExpenses]);

  const loadPendingData = useCallback(async () => {
    if (role !== "project_manager") {
      return;
    }

    setLoadingPending(true);
    try {
      const [pendingExpenseRes, pendingPaymentRes] = await Promise.all([
        fetch("/api/expenses/pm/pending", { cache: "no-store", credentials: "include" }),
        fetch("/api/client-payments/pm/pending", { cache: "no-store", credentials: "include" }),
      ]);

      if (!pendingExpenseRes.ok) {
        throw new Error(await parseApiError(pendingExpenseRes));
      }
      if (!pendingPaymentRes.ok) {
        throw new Error(await parseApiError(pendingPaymentRes));
      }

      const [pendingExpensePayload, pendingPaymentPayload] = (await Promise.all([
        pendingExpenseRes.json(),
        pendingPaymentRes.json(),
      ])) as [PendingExpense[], PendingPayment[]];

      setPendingExpenses(pendingExpensePayload);
      setPendingPayments(pendingPaymentPayload);
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Failed to load pending items");
    } finally {
      setLoadingPending(false);
    }
  }, [role]);

  const loadFormData = useCallback(async () => {
    setLoadingData(true);
    setFormError("");

    try {
      const fetchCalls: Promise<Response>[] = [
        fetch("/api/projects", { cache: "no-store", credentials: "include" }),
      ];

      if (role === "project_manager") {
        fetchCalls.push(fetch("/api/users/me", { cache: "no-store", credentials: "include" }));
      }

      const responses = await Promise.all(fetchCalls);
      const projectsResponse = responses[0];

      if (!projectsResponse.ok) {
        throw new Error(await parseApiError(projectsResponse));
      }

      const projectPayload = (await projectsResponse.json()) as Project[];
      setProjects(projectPayload);

      if (role === "project_manager") {
        const meResponse = responses[1];
        if (!meResponse.ok) {
          throw new Error(await parseApiError(meResponse));
        }
        const mePayload = (await meResponse.json()) as CurrentUser;
        setCanUsePettyCash(Boolean(mePayload.petty_cash_account_id));
      } else {
        setCanUsePettyCash(false);
      }
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Failed to load form data");
    } finally {
      setLoadingData(false);
    }
  }, [role]);

  useEffect(() => {
    void loadFormData();
    void loadPendingData();
  }, [loadFormData, loadPendingData]);

  const onSubmit = async (values: ExpenseFormOutput) => {
    setFormError("");
    setSuccessMessage("");
    setFileError("");

    if (values.paymentSource === "petty_cash" && !canUsePettyCash) {
      setFormError("Petty cash account is not available for this user.");
      return;
    }

    setSubmitting(true);
    try {
      for (const line of values.lines) {
        const formData = new FormData();
        formData.append("project_id", String(line.projectId));
        formData.append("description", values.description);
        formData.append("amount", Number(line.amount).toFixed(2));
        formData.append("expense_date", values.expenseDate);
        formData.append("payment_source", values.paymentSource);
        if (supportingDocument) {
          formData.append("receipt_file", supportingDocument);
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

      setSuccessMessage(
        `${values.lines.length} expense line${values.lines.length > 1 ? "s" : ""} submitted successfully.`
      );
      reset({
        description: "",
        expenseDate: "",
        paymentSource: "personal",
        lines: [{ projectId: "", amount: "" }],
      });
      setSupportingDocument(null);
      if (supportingDocumentInputRef.current) {
        supportingDocumentInputRef.current.value = "";
      }
      if (role === "project_manager") {
        await loadPendingData();
      }
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Failed to submit expenses");
    } finally {
      setSubmitting(false);
    }
  };

  const openReview = (target: ReviewTarget) => {
    setReviewTarget(target);
    setReviewFinalAmount(String(Number(target.currentFinalAmount).toFixed(2)));
    setReviewNotes(target.currentNotes || "");
  };

  const savePmReview = async () => {
    if (!reviewTarget) return;

    setFormError("");
    const finalAmount = Number(reviewFinalAmount);
    if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
      setFormError("Final expense amount must be greater than zero.");
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`/api/expenses/${reviewTarget.expenseId}/pm-review`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          final_expense_amount: Number(finalAmount.toFixed(2)),
          pm_approval_notes: reviewNotes.trim() || null,
        }),
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      setSuccessMessage(`Review updated for expense #${reviewTarget.expenseId}.`);
      setReviewTarget(null);
      await loadPendingData();
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Failed to update review");
    } finally {
      setActionLoading(false);
    }
  };

  const decideExpenseGroup = async (
    group: PendingExpenseGroup,
    status: "approved_by_pm" | "rejected_by_pm"
  ) => {
    setFormError("");
    setActionLoading(true);
    try {
      for (const line of group.lineItems) {
        const payload: {
          status: "approved_by_pm" | "rejected_by_pm";
          final_expense_amount?: number;
          pm_approval_notes?: string | null;
        } = {
          status,
          pm_approval_notes: line.notes || null,
        };

        if (status === "approved_by_pm") {
          if (!Number.isFinite(line.amountFinal) || line.amountFinal <= 0) {
            throw new Error(`Expense #${line.expenseId} requires a valid final amount before approval.`);
          }
          payload.final_expense_amount = Number(line.amountFinal.toFixed(2));
        }

        const res = await fetch(`/api/expenses/${line.expenseId}/pm-decision`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error(await parseApiError(res));
        }
      }

      setSuccessMessage(
        status === "approved_by_pm"
          ? "Expense group approved by PM and sent to admin review."
          : "Expense group declined by PM."
      );
      setReviewTarget(null);
      await loadPendingData();
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Failed to update PM decision");
    } finally {
      setActionLoading(false);
    }
  };

  const decidePayment = async (
    payment: PendingPayment,
    status: "approved_by_pm" | "rejected_by_pm"
  ) => {
    setFormError("");
    setActionLoading(true);
    try {
      const res = await fetch(`/api/client-payments/${payment.id}/pm-decision`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      setSuccessMessage(
        status === "approved_by_pm"
          ? `Payment #${payment.id} approved by PM and sent to admin.`
          : `Payment #${payment.id} declined by PM.`
      );
      await loadPendingData();
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Failed to update payment decision");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <header className={styles.header}>
          <h1 className={styles.title}>Project Expense Dashboard</h1>
          <p className={styles.subtitle}>
            Submit expense lines with supporting details and choose how the expense was paid.
          </p>
        </header>

        {formError ? (
          <p className={styles.errorText}>{formError}</p>
        ) : null}
        {successMessage ? (
          <p className={styles.successText}>{successMessage}</p>
        ) : null}

        <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
          <div className={styles.topGrid}>
            <div>
              <label className={styles.label} htmlFor="description">
                Description
              </label>
              <input
                id="description"
                className={styles.input}
                placeholder="What is this expense for?"
                disabled={submitting}
                {...register("description")}
              />
              {errors.description?.message ? <p className={styles.validationText}>{errors.description.message}</p> : null}
            </div>

            <div>
              <label className={styles.label} htmlFor="expenseDate">
                Expense Date
              </label>
              <input
                id="expenseDate"
                className={styles.input}
                type="date"
                disabled={submitting}
                {...register("expenseDate")}
              />
              {errors.expenseDate?.message ? <p className={styles.validationText}>{errors.expenseDate.message}</p> : null}
            </div>

            <div>
              <label className={styles.label} htmlFor="paymentSource">
                Paid Using
              </label>
              <select id="paymentSource" className={styles.input} disabled={submitting} {...register("paymentSource")}>
                {paymentSourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {errors.paymentSource?.message ? <p className={styles.validationText}>{errors.paymentSource.message}</p> : null}
            </div>

            <div>
              <label className={styles.label} htmlFor="supportingDocument">
                Supporting Document
              </label>
              <input
                id="supportingDocument"
                  ref={supportingDocumentInputRef}
                className={styles.input}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                disabled={submitting}
                onChange={(event) => {
                  setFileError("");
                  setSupportingDocument(event.target.files?.[0] || null);
                }}
              />
              {supportingDocument?.name ? <p className={styles.helperText}>Selected: {supportingDocument.name}</p> : null}
              {fileError ? <p className={styles.validationText}>{fileError}</p> : null}
            </div>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Expense Lines</h2>

            {fields.map((field, index) => (
              <div key={field.id} className={styles.expenseRow}>
                <div>
                  <label className={styles.label} htmlFor={`line-project-${index}`}>
                    Project {index + 1}
                  </label>
                  <select
                    id={`line-project-${index}`}
                    className={styles.input}
                    disabled={loadingData || submitting}
                    {...register(`lines.${index}.projectId`)}
                  >
                    <option value="">{loadingData ? "Loading projects..." : "Select project"}</option>
                    {projectOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {errors.lines?.[index]?.projectId?.message ? (
                    <p className={styles.validationText}>{errors.lines[index]?.projectId?.message}</p>
                  ) : null}
                </div>

                <div>
                  <label className={styles.label} htmlFor={`line-amount-${index}`}>
                    Amount
                  </label>
                  <input
                    id={`line-amount-${index}`}
                    className={styles.input}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    disabled={submitting}
                    {...register(`lines.${index}.amount`)}
                  />
                  {errors.lines?.[index]?.amount?.message ? (
                    <p className={styles.validationText}>{errors.lines[index]?.amount?.message}</p>
                  ) : null}
                </div>

                <div className={styles.rowButtonWrap}>
                  <button
                    type="button"
                    onClick={() => {
                      if (fields.length > 1) {
                        remove(index);
                      }
                    }}
                    disabled={submitting || fields.length <= 1}
                    className={styles.secondaryButton}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}

            <div className={styles.actionsRow}>
              <button
                type="button"
                onClick={() => append({ projectId: "", amount: "" })}
                disabled={submitting}
                className={styles.secondaryButton}
              >
                + Add Expense Line
              </button>
              <div className={styles.totalInline}>
                Total: <span>{formatCurrency(totalAmount)}</span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || loadingData}
            className={styles.primaryButton}
          >
            {submitting ? "Submitting..." : "Submit Expense"}
          </button>
        </form>
      </section>

      {role === "project_manager" ? (
        <section className={styles.pendingStack}>
          <div className={styles.pendingCard}>
            <h2 className={styles.pendingTitle}>Pending Expenses</h2>
            <p className={styles.pendingSubtitle}>Items waiting for project manager actions.</p>

            {loadingPending ? (
              <p className={styles.pendingLoading}>Loading pending expenses...</p>
            ) : groupedPendingExpenses.length === 0 ? (
              <p className={styles.emptyState}>No pending expenses</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Employer</th>
                      <th>Description</th>
                      <th>Project</th>
                      <th className={styles.numericCell}>Total Original</th>
                      <th className={styles.numericCell}>Total Final</th>
                      <th>PM Review Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedPendingExpenses.map((group) => (
                      group.lineItems.map((line, lineIndex) => {
                        const isFirstLine = lineIndex === 0;
                        return (
                          <tr key={`${group.id}-${line.id}`}>
                            {isFirstLine && (
                              <td rowSpan={group.lineItems.length} className={styles.tableCellTop}>
                                {formatDate(group.date)}
                              </td>
                            )}
                            {isFirstLine && (
                              <td rowSpan={group.lineItems.length} className={styles.tableCellTop}>
                                {group.employer}
                              </td>
                            )}
                            {isFirstLine && (
                              <td rowSpan={group.lineItems.length} className={styles.tableCellTop}>
                                {group.description}
                              </td>
                            )}

                            <td>{line.project}</td>
                            <td className={styles.numericCell}>{formatCurrency(line.amountOriginal)}</td>
                            <td className={styles.numericCell}>{formatCurrency(line.amountFinal)}</td>

                            {isFirstLine && (
                              <td rowSpan={group.lineItems.length} className={styles.tableCellTop}>
                                <span className={`${styles.pmStatusPill} ${group.pmReviewStatus === "In Review" ? styles.pmStatusInReview : styles.pmStatusPending}`}>
                                  {group.pmReviewStatus}
                                </span>
                              </td>
                            )}

                            <td className={styles.tableCellTop}>
                              <div className={styles.pendingActionsRow}>
                                <div className={styles.leftActionGroup}>
                                  <button
                                    type="button"
                                    className={styles.secondaryButton}
                                    onClick={() =>
                                      openReview({
                                        groupId: group.id,
                                        expenseId: line.expenseId,
                                        project: line.project,
                                        date: group.date,
                                        employer: group.employer,
                                        description: group.description,
                                        originalAmount: line.amountOriginal,
                                        currentFinalAmount: line.amountFinal,
                                        currentNotes: line.notes,
                                      })
                                    }
                                    disabled={actionLoading}
                                  >
                                    Review
                                  </button>
                                </div>
                                <div className={styles.rightActionGroup}>
                                  {isFirstLine ? (
                                    <>
                                      <button
                                        type="button"
                                        className={styles.primaryButton}
                                        onClick={() => decideExpenseGroup(group, "approved_by_pm")}
                                        disabled={actionLoading}
                                      >
                                        Approve
                                      </button>
                                      <button
                                        type="button"
                                        className={styles.declineButton}
                                        onClick={() => decideExpenseGroup(group, "rejected_by_pm")}
                                        disabled={actionLoading}
                                      >
                                        Decline
                                      </button>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className={styles.pendingCard}>
            <h2 className={styles.pendingTitle}>Pending Payments</h2>
            <p className={styles.pendingSubtitle}>Client payments requiring manager review.</p>

            {loadingPending ? (
              <p className={styles.pendingLoading}>Loading pending payments...</p>
            ) : pendingPayments.length === 0 ? (
              <p className={styles.emptyState}>No pending payments</p>
            ) : (
              <ul className={styles.pendingList}>
                {pendingPayments.slice(0, 8).map((item) => (
                  <li key={item.id} className={styles.pendingItem}>
                    <div className={styles.pendingTopRow}>
                      <div>
                        <p className={styles.pendingLineTitle}>#{item.id} - {item.project_name}</p>
                        <p className={styles.pendingMeta}>{item.client_name} | {formatDate(item.payment_date)}</p>
                      </div>
                      <div className={styles.pendingRight}>
                        <p className={styles.pendingAmount}>{formatCurrency(item.amount)}</p>
                        <span className={`${styles.statusBadge} ${statusClassName(item.status)}`}>
                          {statusLabel(item.status)}
                        </span>
                      </div>
                    </div>
                    <div className={styles.pendingActions}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => decidePayment(item, "approved_by_pm")}
                        disabled={actionLoading}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className={styles.declineButton}
                        onClick={() => decidePayment(item, "rejected_by_pm")}
                        disabled={actionLoading}
                      >
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {reviewTarget ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modalPanel}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Review Expense #{reviewTarget.expenseId}</h3>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setReviewTarget(null)}
                disabled={actionLoading}
              >
                Close
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.reviewDetailsGrid}>
                <p><strong>Date:</strong> {formatDate(reviewTarget.date)}</p>
                <p><strong>Employee:</strong> {reviewTarget.employer}</p>
                <p><strong>Project:</strong> {reviewTarget.project}</p>
                <p><strong>Description:</strong> {reviewTarget.description}</p>
                <p><strong>Original Value:</strong> {formatCurrency(reviewTarget.originalAmount)}</p>
              </div>

              <div className={styles.reviewGrid}>
                <div>
                  <label className={styles.label} htmlFor="pmFinalAmount">
                    Final Amount
                  </label>
                  <input
                    id="pmFinalAmount"
                    className={styles.input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={reviewFinalAmount}
                    onChange={(event) => setReviewFinalAmount(event.target.value)}
                  />
                </div>
                <div>
                  <label className={styles.label} htmlFor="pmNotes">
                    PM Notes (Optional)
                  </label>
                  <input
                    id="pmNotes"
                    className={styles.input}
                    value={reviewNotes}
                    onChange={(event) => setReviewNotes(event.target.value)}
                    placeholder="Any remarks for admin"
                  />
                </div>
              </div>

              <div className={styles.reviewActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setReviewTarget(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={savePmReview}
                  disabled={actionLoading}
                >
                  {actionLoading ? "Saving..." : "Save Review"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

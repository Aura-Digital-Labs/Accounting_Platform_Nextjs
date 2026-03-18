"use client";

import { Fragment } from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import styles from "./AdminDashboard.module.css";

export type PMReviewStatus = "Pending" | "In Review" | "Approved" | "Declined";

export type ExpenseLineItem = {
  id: number;
  expenseId: number;
  project: string;
  reviewLabel?: string;
  amountOriginal: number;
  amountFinal: number;
};

export type PendingExpenseGroup = {
  id: number;
  date: string;
  employer: string;
  description: string;
  project: string;
  pmReviewStatus: PMReviewStatus;
  documentUrl?: string | null;
  lineItems: ExpenseLineItem[];
};

type PendingExpensesTableProps = {
  expenses: PendingExpenseGroup[];
  onUpdated?: () => void | Promise<void>;
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
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

async function parseError(res: Response) {
  try {
    const payload = (await res.json()) as { detail?: string };
    return payload.detail || `Request failed: ${res.status}`;
  } catch {
    return `Request failed: ${res.status}`;
  }
}

export default function PendingExpensesTable({ expenses, onUpdated }: PendingExpensesTableProps) {
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [reviewFinalAmount, setReviewFinalAmount] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusError, setStatusError] = useState("");

  const clearStatus = () => {
    setStatusMessage("");
    setStatusError("");
  };

  const groupsWithTotals = useMemo(
    () =>
      expenses.map((group) => {
        const totalOriginal = group.lineItems.reduce((sum, item) => sum + item.amountOriginal, 0);
        const totalFinal = group.lineItems.reduce((sum, item) => sum + item.amountFinal, 0);

        return {
          ...group,
          totalOriginal,
          totalFinal,
        };
      }),
    [expenses]
  );

  const handleReview = (target: ReviewTarget) => {
    clearStatus();
    setReviewTarget(target);
    setReviewFinalAmount(String(Number(target.currentFinalAmount).toFixed(2)));
  };

  const handleSaveReview = async () => {
    if (!reviewTarget) return;

    clearStatus();
    const numericFinalAmount = Number(reviewFinalAmount);
    if (!Number.isFinite(numericFinalAmount) || numericFinalAmount <= 0) {
      setStatusError("Final value must be greater than zero.");
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`/api/expenses/${reviewTarget.expenseId}/admin-review`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ final_expense_amount: Number(numericFinalAmount.toFixed(2)) }),
      });

      if (!res.ok) {
        throw new Error(await parseError(res));
      }

      setStatusMessage(`Final value updated for expense #${reviewTarget.expenseId}.`);
      setReviewTarget(null);
      if (onUpdated) {
        await onUpdated();
      }
    } catch (saveError) {
      setStatusError(saveError instanceof Error ? saveError.message : "Failed to save review value");
    } finally {
      setActionLoading(false);
    }
  };

  const handleGroupDecision = async (groupId: number, status: "approved" | "rejected") => {
    clearStatus();
    const group = groupsWithTotals.find((item) => item.id === groupId);
    if (!group) {
      setStatusError("Group not found.");
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch("/api/expenses/group-decision", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          expense_ids: group.lineItems.map((line) => line.expenseId),
        }),
      });

      if (!res.ok) {
        throw new Error(await parseError(res));
      }

      setStatusMessage(status === "approved" ? "Expense group approved." : "Expense group declined.");
      setReviewTarget(null);
      if (onUpdated) {
        await onUpdated();
      }
    } catch (decisionError) {
      setStatusError(decisionError instanceof Error ? decisionError.message : "Failed to update group decision");
    } finally {
      setActionLoading(false);
    }
  };

  const grandTotalFinal = groupsWithTotals.reduce((sum, group) => sum + group.totalFinal, 0);

  const pmStatusClass = (status: PMReviewStatus) => {
    if (status === "Approved") return styles.pmStatusApproved;
    if (status === "Declined") return styles.pmStatusDeclined;
    if (status === "In Review") return styles.pmStatusInReview;
    return styles.pmStatusPending;
  };

  return (
    <>
      <p className={styles.pendingGroupCount}>{groupsWithTotals.length} groups</p>
      {(statusMessage || statusError) && (
        <div className={styles.statusBlockRow}>
          {statusMessage && <p className={styles.successText}>{statusMessage}</p>}
          {statusError && <p className={styles.errorText}>{statusError}</p>}
        </div>
      )}

      {reviewTarget && (
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
                <p><strong>Date:</strong> {new Date(reviewTarget.date).toLocaleDateString()}</p>
                <p><strong>Employee:</strong> {reviewTarget.employer}</p>
                <p><strong>Project:</strong> {reviewTarget.project}</p>
                <p><strong>Description:</strong> {reviewTarget.description}</p>
                <p><strong>Original Value:</strong> {formatCurrency(reviewTarget.originalAmount)}</p>
              </div>

              <div className={styles.inlineForm}>
                <label className={styles.label}>
                  Final Value
                  <input
                    className={styles.input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={reviewFinalAmount}
                    onChange={(e) => setReviewFinalAmount(e.target.value)}
                  />
                </label>
              </div>

              <div className={styles.actionsRowSimple}>
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
                  onClick={handleSaveReview}
                  disabled={actionLoading}
                >
                  {actionLoading ? "Saving..." : "Save Final Value"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Employer</th>
              <th>Description</th>
              <th>Link</th>
              <th>Project</th>
              <th className={styles.numericCell}>Total Original</th>
              <th className={styles.numericCell}>Total Final</th>
              <th>PM Review Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {groupsWithTotals.length === 0 ? (
              <tr>
                <td colSpan={9} className={styles.emptyCell}>
                  No pending expenses found.
                </td>
              </tr>
            ) : (
              groupsWithTotals.map((group) => (
                <Fragment key={`group-${group.id}`}>
                  {group.lineItems.map((lineItem, lineIndex) => {
                    const isFirstLine = lineIndex === 0;

                    return (
                      <tr key={`${group.id}-${lineItem.id}`}>
                        {isFirstLine && (
                          <td rowSpan={group.lineItems.length} className={styles.tableCellTop}>
                            {new Date(group.date).toLocaleDateString()}
                          </td>
                        )}

                        {isFirstLine && (
                          <td rowSpan={group.lineItems.length} className={styles.tableCellTop}>
                            {group.employer}
                          </td>
                        )}

                        {isFirstLine && <td rowSpan={group.lineItems.length} className={styles.tableCellTop}>{group.description}</td>}

                        {isFirstLine && (
                          <td rowSpan={group.lineItems.length} className={styles.tableCellTop}>
                            {group.documentUrl ? (
                              group.documentUrl.startsWith("/") ? (
                                <Link href={group.documentUrl} className={styles.accountLink}>
                                  View
                                </Link>
                              ) : (
                                <a
                                  href={group.documentUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={styles.accountLink}
                                >
                                  View
                                </a>
                              )
                            ) : (
                              "-"
                            )}
                          </td>
                        )}

                        <td>{lineItem.project}</td>

                        <td className={styles.numericCell}>{formatCurrency(lineItem.amountOriginal)}</td>

                        <td className={`${styles.numericCell} ${styles.finalTotalCell}`}>
                          {formatCurrency(lineItem.amountFinal)}
                        </td>

                        {isFirstLine && (
                          <td rowSpan={group.lineItems.length} className={styles.tableCellTop}>
                            <span className={`${styles.pmStatusPill} ${pmStatusClass(group.pmReviewStatus)}`}>
                              {group.pmReviewStatus}
                            </span>
                          </td>
                        )}

                        <td className={styles.tableCellTop}>
                          <div className={styles.pendingActions}>
                            <button
                              type="button"
                              onClick={() =>
                                handleReview({
                                  groupId: group.id,
                                  expenseId: lineItem.expenseId,
                                  project: lineItem.project,
                                  date: group.date,
                                  employer: group.employer,
                                  description: group.description,
                                  originalAmount: lineItem.amountOriginal,
                                  currentFinalAmount: lineItem.amountFinal,
                                })
                              }
                              className={`${styles.actionButtonSm} ${styles.reviewButton}`}
                              disabled={actionLoading}
                            >
                              {lineItem.reviewLabel || "Review"}
                            </button>

                            {isFirstLine && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleGroupDecision(group.id, "approved")}
                                  className={`${styles.actionButtonSm} ${styles.approveButton}`}
                                  disabled={actionLoading}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleGroupDecision(group.id, "rejected")}
                                  className={`${styles.actionButtonSm} ${styles.declineButton}`}
                                  disabled={actionLoading}
                                >
                                  Decline
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  <tr className={styles.groupTotalRow}>
                    <td colSpan={5} className={`${styles.groupTotalLabel} ${styles.numericCell}`}>
                      Group Total
                    </td>
                    <td className={`${styles.numericCell} ${styles.groupTotalValue}`}>
                      {formatCurrency(group.totalOriginal)}
                    </td>
                    <td className={`${styles.numericCell} ${styles.groupTotalValue} ${styles.finalTotalCell}`}>
                      {formatCurrency(group.totalFinal)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </Fragment>
              ))
            )}
          </tbody>

          <tfoot>
            <tr className={styles.grandTotalRow}>
              <td colSpan={6} className={styles.numericCell}>
                Grand Total
              </td>
              <td className={`${styles.numericCell} ${styles.finalTotalCell}`}>
                {formatCurrency(grandTotalFinal)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

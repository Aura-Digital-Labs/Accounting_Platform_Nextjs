"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./AdminDashboard.module.css";

type BankAccountOption = {
  id: number;
  code: string;
  name: string;
  isPaymentAccepting: boolean;
  isClosed: boolean;
};

type BankStatementRow = {
  id: number;
  accountId: number;
  month: string;
  statementLink: string;
  createdAt?: string;
  updatedAt?: string;
};

type Props = {
  accounts: BankAccountOption[];
  onUploaded?: () => void | Promise<void>;
};

function getCurrentYearMonth() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function getTimelineMonths() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, index) => {
    const offset = index - 11;
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      ym,
      monthNumber: d.getMonth() + 1,
      isCurrent: index === 11,
    };
  });
}

async function parseError(res: Response) {
  try {
    const payload = (await res.json()) as { detail?: string };
    return payload.detail || `Request failed: ${res.status}`;
  } catch {
    return `Request failed: ${res.status}`;
  }
}

export default function BankStatementsDashboard({ accounts, onUploaded }: Props) {
  const [statements, setStatements] = useState<BankStatementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadAccountId, setUploadAccountId] = useState("");
  const [uploadMonth, setUploadMonth] = useState(getCurrentYearMonth());
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [showViewModal, setShowViewModal] = useState(false);
  const [viewAccountId, setViewAccountId] = useState("");
  const [viewMonth, setViewMonth] = useState(getCurrentYearMonth());

  const paymentAccounts = useMemo(
    () => accounts.filter((account) => account.isPaymentAccepting && !account.isClosed),
    [accounts]
  );

  const currentYm = useMemo(() => getCurrentYearMonth(), []);
  const timelineMonths = useMemo(() => getTimelineMonths(), []);

  const loadStatements = async () => {
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const res = await fetch("/api/bank-statements/all", {
        cache: "no-store",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(await parseError(res));
      }

      const payload = (await res.json()) as BankStatementRow[];
      setStatements(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load bank statements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatements();
  }, []);

  const statementsByAccount = useMemo(() => {
    const map = new Map<number, BankStatementRow[]>();
    for (const statement of statements) {
      const existing = map.get(statement.accountId) || [];
      existing.push(statement);
      map.set(statement.accountId, existing);
    }

    for (const [key, value] of map.entries()) {
      map.set(
        key,
        value.sort((a, b) => (a.month > b.month ? -1 : a.month < b.month ? 1 : 0))
      );
    }

    return map;
  }, [statements]);

  const openUploadModal = () => {
    setUploadAccountId(paymentAccounts[0] ? String(paymentAccounts[0].id) : "");
    setUploadMonth(getCurrentYearMonth());
    setUploadFile(null);
    setShowUploadModal(true);
  };

  const openViewModal = (accountId: number) => {
    setViewAccountId(String(accountId));
    setViewMonth(getCurrentYearMonth());
    setShowViewModal(true);
  };

  const uploadStatement = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");
    setError("");

    if (!uploadAccountId || !uploadMonth || !uploadFile) {
      setError("Select account, month, and file.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("account_id", uploadAccountId);
      formData.append("month", uploadMonth);
      formData.append("file", uploadFile);

      const res = await fetch("/api/bank-statements/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(await parseError(res));
      }

      setMessage("Bank statement uploaded.");
      setShowUploadModal(false);
      await loadStatements();
      if (onUploaded) {
        await onUploaded();
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Failed to upload bank statement");
    } finally {
      setUploading(false);
    }
  };

  const selectedViewStatement = useMemo(() => {
    if (!viewAccountId || !viewMonth) return null;
    const accountId = Number(viewAccountId);
    return statements.find((s) => s.accountId === accountId && s.month === viewMonth) || null;
  }, [statements, viewAccountId, viewMonth]);

  return (
    <section className={styles.card}>
      <div className={styles.bankHeader}>
        <h2 className={styles.sectionTitle}>Bank Statements</h2>
        <button className={styles.primaryButton} type="button" onClick={openUploadModal}>
          Upload Bank Statement
        </button>
      </div>

      {(message || error) && (
        <div className={styles.statusBlockRow}>
          {message && <p className={styles.successText}>{message}</p>}
          {error && <p className={styles.errorText}>{error}</p>}
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Bank Account</th>
              <th>Status</th>
              <th>Last Updated</th>
              <th>Monthly Uploads</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paymentAccounts.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.emptyCell}>No payment accepting accounts found.</td>
              </tr>
            ) : (
              paymentAccounts.map((account) => {
                const rows = statementsByAccount.get(account.id) || [];
                const hasCurrentMonth = rows.some((row) => row.month === currentYm);
                const lastUpdated = rows[0]?.month || "-";
                const monthSet = new Set(rows.map((row) => row.month));

                return (
                  <tr key={account.id}>
                    <td>{account.code} - {account.name}</td>
                    <td>
                      <span className={hasCurrentMonth ? styles.statusUpdated : styles.statusExpired}>
                        {hasCurrentMonth ? "Updated" : "Expired"}
                      </span>
                    </td>
                    <td>{lastUpdated}</td>
                    <td>
                      <div className={styles.monthTimeline}>
                        {timelineMonths.map((month) => (
                          <div
                            key={`${account.id}-${month.ym}`}
                            className={`${styles.monthBox} ${monthSet.has(month.ym) ? styles.monthBoxUploaded : ""} ${month.isCurrent ? styles.monthBoxCurrent : ""}`}
                            title={month.ym}
                          >
                            {month.monthNumber}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>
                      <button className={styles.secondaryButton} type="button" onClick={() => openViewModal(account.id)}>
                        View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showUploadModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalPanelWide}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Upload Bank Statement</h3>
              <button className={styles.secondaryButton} type="button" onClick={() => setShowUploadModal(false)}>
                Close
              </button>
            </div>
            <form className={styles.modalBody} onSubmit={uploadStatement}>
              <div className={styles.inlineForm}>
                <label className={styles.label}>
                  Bank Account
                  <select
                    className={styles.input}
                    value={uploadAccountId}
                    onChange={(e) => setUploadAccountId(e.target.value)}
                    required
                  >
                    <option value="">Select account</option>
                    {paymentAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.label}>
                  Month/Year
                  <input
                    className={styles.input}
                    type="month"
                    value={uploadMonth}
                    onChange={(e) => setUploadMonth(e.target.value)}
                    required
                  />
                </label>
              </div>

              <label
                className={styles.uploadDropZone}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) setUploadFile(file);
                }}
              >
                <input
                  type="file"
                  className={styles.hiddenFileInput}
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  required
                />
                <span className={styles.uploadDropTitle}>Drag and drop statement here</span>
                <span className={styles.uploadDropSubtitle}>or click to choose file</span>
                {uploadFile && <span className={styles.uploadFileName}>{uploadFile.name}</span>}
              </label>

              <div className={styles.actionsRowSimple}>
                <button className={styles.primaryButton} type="submit" disabled={uploading}>
                  {uploading ? "Uploading..." : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showViewModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalPanel}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>View Bank Statement</h3>
              <button className={styles.secondaryButton} type="button" onClick={() => setShowViewModal(false)}>
                Close
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.inlineForm}>
                <label className={styles.label}>
                  Bank Account
                  <select
                    className={styles.input}
                    value={viewAccountId}
                    onChange={(e) => setViewAccountId(e.target.value)}
                  >
                    <option value="">Select account</option>
                    {paymentAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.label}>
                  Month/Year
                  <input
                    className={styles.input}
                    type="month"
                    value={viewMonth}
                    onChange={(e) => setViewMonth(e.target.value)}
                  />
                </label>
              </div>

              {selectedViewStatement ? (
                <a
                  href={selectedViewStatement.statementLink}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.accountLink}
                >
                  Open Statement ({selectedViewStatement.month})
                </a>
              ) : (
                <p className={styles.emptyState}>No statement found for the selected month.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {loading && <p className={styles.helperText}>Loading statements...</p>}
    </section>
  );
}

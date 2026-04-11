"use client";

import Link from "next/link";
import LoadingSpinner from '@/components/LoadingSpinner';
import toast from 'react-hot-toast';

import { FormEvent, useCallback, useMemo, useState } from "react";
import { useEffect } from "react";
import styles from "./page.module.css";

type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

type AccountRow = {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  subType: string;
  isCurrent: boolean;
  description: string | null;
  projectId: number | null;
  isClosed: boolean;
  isPaymentAccepting: boolean;
  isPettyCash: boolean;
  includeCashFlow: boolean;
  accountNumber: string | null;
  accountHolderName: string | null;
  bankName: string | null;
  bankBranch: string | null;
};

type LedgerRow = {
  entry_id: number;
  transaction_id: number;
  date: string;
  description: string;
  affected_account: string;
  entry_type: "debit" | "credit";
  amount: number;
  is_checked: boolean;
  is_transaction_checked: boolean;
  document_link: string | null;
};

type TransactionDetail = {
  id: number;
  description: string;
  entries: {
    id: number;
    accountId: number;
    entryType: "debit" | "credit";
    amount: number;
    isChecked: boolean;
  }[];
};

type AccountOption = {
  id: number;
  code: string;
  name: string;
  isClosed: boolean;
};

function fmt(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}

async function parseError(res: Response) {
  try {
    const payload = (await res.json()) as { detail?: string };
    return payload.detail || `Request failed: ${res.status}`;
  } catch {
    return `Request failed: ${res.status}`;
  }
}

export default function AccountTransactionsClient({ accountId, isReadOnly = false }: { accountId: number, isReadOnly?: boolean }) {
  const [account, setAccount] = useState<AccountRow | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedEntryIds, setSelectedEntryIds] = useState<number[]>([]);
  const [showCheckedTransactions, setShowCheckedTransactions] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [editingAccount, setEditingAccount] = useState(false);
  const [accountForm, setAccountForm] = useState({
    code: "",
    name: "",
    type: "asset" as AccountType,
    subType: "none",
    isCurrent: true,
    description: "",
    isPaymentAccepting: false,
    isPettyCash: false,
    includeCashFlow: false,
    accountNumber: "",
    accountHolderName: "",
    bankName: "",
    bankBranch: "",
  });

  const [editingTransactionId, setEditingTransactionId] = useState<number | null>(null);
  const [txForm, setTxForm] = useState<{
    description: string;
    amount: string;
    entries: { accountId: string; entryType: "debit" | "credit"; amount?: string }[];
  }>({ description: "", amount: "", entries: [] });

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    action: "close" | "check" | null;
    inputText: string;
  }>({ isOpen: false, action: null, inputText: "" });

  const clearStatus = () => {
    setMessage("");
    setError("");
  };

  const load = useCallback(async () => {
    setLoading(true);
    clearStatus();

    try {
      const [accountRes, ledgerRes, accountsRes] = await Promise.all([
        fetch(`/api/accounts/${accountId}`, { credentials: "include", cache: "no-store" }),
        fetch(`/api/reports/ledger/${accountId}`, { credentials: "include", cache: "no-store" }),
        fetch("/api/accounts?include_closed=true", { credentials: "include", cache: "no-store" }),
      ]);

      if (!accountRes.ok) throw new Error(await parseError(accountRes));
      if (!ledgerRes.ok) throw new Error(await parseError(ledgerRes));
      if (!accountsRes.ok) throw new Error(await parseError(accountsRes));

      const accountPayload = (await accountRes.json()) as AccountRow;
      const ledgerPayload = (await ledgerRes.json()) as LedgerRow[];
      const accountsPayload = (await accountsRes.json()) as AccountOption[];

      setAccount(accountPayload);
      setLedger(ledgerPayload);
      setAccountOptions(accountsPayload);
      setAccountForm({
        code: accountPayload.code,
        name: accountPayload.name,
        type: accountPayload.type,
        subType: accountPayload.subType || "none",
        isCurrent: accountPayload.isCurrent ?? true,
        description: accountPayload.description || "",
        isPaymentAccepting: accountPayload.isPaymentAccepting,
        isPettyCash: accountPayload.isPettyCash,
        includeCashFlow: accountPayload.includeCashFlow,
        accountNumber: accountPayload.accountNumber || "",
        accountHolderName: accountPayload.accountHolderName || "",
        bankName: accountPayload.bankName || "",
        bankBranch: accountPayload.bankBranch || "",
      });
      setSelectedEntryIds([]);
    } catch (loadError) {
      const errMsg = loadError instanceof Error ? loadError.message : "Failed to load account data"; toast.error(errMsg); setError(errMsg);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  const checkedIds = useMemo(
    () => new Set(ledger.filter((row) => row.is_checked).map((row) => row.entry_id)),
    [ledger]
  );

  const checkedTransactionIds = useMemo(
    () => new Set(ledger.filter((row) => row.is_transaction_checked).map((row) => row.transaction_id)),
    [ledger]
  );

  const checkedRows = useMemo(() => ledger.filter((row) => row.is_checked), [ledger]);

  const uncheckedRows = useMemo(() => ledger.filter((row) => !row.is_checked), [ledger]);

  const checkedCarryDown = useMemo(() => {
    const debit = checkedRows
      .filter((row) => row.entry_type === "debit")
      .reduce((sum, row) => sum + Number(row.amount), 0);
    const credit = checkedRows
      .filter((row) => row.entry_type === "credit")
      .reduce((sum, row) => sum + Number(row.amount), 0);
    const diff = Number(Math.abs(debit - credit).toFixed(2));
    return {
      debit: debit >= credit ? diff : 0,
      credit: credit > debit ? diff : 0,
    };
  }, [checkedRows]);

  const tableDifference = useMemo(() => {
    const visibleDebit = uncheckedRows
      .filter((row) => row.entry_type === "debit")
      .reduce((sum, row) => sum + Number(row.amount), 0);
    const visibleCredit = uncheckedRows
      .filter((row) => row.entry_type === "credit")
      .reduce((sum, row) => sum + Number(row.amount), 0);

    const totalDebit = Number((visibleDebit + checkedCarryDown.debit).toFixed(2));
    const totalCredit = Number((visibleCredit + checkedCarryDown.credit).toFixed(2));
    const diff = Number(Math.abs(totalDebit - totalCredit).toFixed(2));

    return {
      debit: totalDebit > totalCredit ? diff : 0,
      credit: totalCredit > totalDebit ? diff : 0,
    };
  }, [uncheckedRows, checkedCarryDown]);

  const toggleEntrySelection = (entryId: number) => {
    if (checkedIds.has(entryId)) return;
    setSelectedEntryIds((prev) =>
      prev.includes(entryId) ? prev.filter((id) => id !== entryId) : [...prev, entryId]
    );
  };

  const promptCheckSelected = () => {
    clearStatus();
    if (selectedEntryIds.length === 0) {
      toast.error("Select at least one transaction to check."); setError("Select at least one transaction to check.");
      return;
    }
    setConfirmModal({ isOpen: true, action: "check", inputText: "" });
  };

  const checkSelected = async () => {
    clearStatus();

    if (selectedEntryIds.length === 0) {
      toast.error("Select at least one transaction to check."); setError("Select at least one transaction to check.");
      return;
    }

    try {
      const res = await fetch("/api/transactions/entries/check", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry_ids: selectedEntryIds }),
      });

      if (!res.ok) {
        throw new Error(await parseError(res));
      }

      setShowCheckedTransactions(false);
      setMessage("Selected transactions checked. Checked items are now carried down.");
      await load();
    } catch (checkError) {
      const errMsg = checkError instanceof Error ? checkError.message : "Failed to check transactions"; toast.error(errMsg); setError(errMsg);
    }
  };

  const saveAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (!account) return;
    clearStatus();

    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: accountForm.code,
          name: accountForm.name,
          type: accountForm.type,
          subType: accountForm.subType,
          isCurrent: accountForm.isCurrent,
          subType: accountForm.subType,
          isCurrent: accountForm.isCurrent,
          description: accountForm.description || null,
          isPaymentAccepting: accountForm.isPaymentAccepting,
          isPettyCash: accountForm.isPettyCash,
          includeCashFlow: accountForm.includeCashFlow,
          accountNumber: accountForm.accountNumber || null,
          accountHolderName: accountForm.accountHolderName || null,
          bankName: accountForm.bankName || null,
          bankBranch: accountForm.bankBranch || null,
        }),
      });

      if (!res.ok) {
        throw new Error(await parseError(res));
      }

      setMessage("Account updated.");
      setEditingAccount(false);
      await load();
    } catch (saveError) {
      const errMsg = saveError instanceof Error ? saveError.message : "Failed to update account"; toast.error(errMsg); setError(errMsg);
    }
  };

  const promptCloseAccount = () => {
    clearStatus();
    if (!account) return;
    setConfirmModal({ isOpen: true, action: "close", inputText: "" });
  };

  const closeAccount = async () => {
    if (!account) return;
    clearStatus();

    try {
      const res = await fetch(`/api/accounts/${account.id}/close`, {
        method: "PATCH",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(await parseError(res));
      }

      setMessage("Account closed.");
      await load();
    } catch (closeError) {
      const errMsg = closeError instanceof Error ? closeError.message : "Failed to close account"; toast.error(errMsg); setError(errMsg);
    }
  };

  const startTransactionEdit = async (transactionId: number) => {
    clearStatus();

    if (checkedTransactionIds.has(transactionId)) {
      toast.error("Checked transactions cannot be edited."); setError("Checked transactions cannot be edited.");
      return;
    }

    try {
      const res = await fetch(`/api/transactions/${transactionId}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(await parseError(res));
      }

      const payload = (await res.json()) as TransactionDetail;
      const initialAmount = payload.entries[0] ? String(Number(payload.entries[0].amount)) : "";
      
      setTxForm({
        description: payload.description,
        amount: initialAmount,
        entries: payload.entries.map((entry) => ({
          accountId: String(entry.accountId),
          entryType: entry.entryType,
        })),
      });
      setEditingTransactionId(payload.id);
    } catch (editError) {
      const errMsg = editError instanceof Error ? editError.message : "Failed to open transaction editor"; toast.error(errMsg); setError(errMsg);
    }
  };

  const saveTransactionEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingTransactionId) return;
    clearStatus();

    try {
      const entries = txForm.entries.map((entry) => ({
        accountId: Number(entry.accountId),
        entryType: entry.entryType,
        amount: Number(txForm.amount),
      }));

      const res = await fetch(`/api/transactions/${editingTransactionId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: txForm.description,
          entries,
        }),
      });

      if (!res.ok) {
        throw new Error(await parseError(res));
      }

      setMessage("Transaction updated.");
      setEditingTransactionId(null);
      await load();
    } catch (saveError) {
      const errMsg = saveError instanceof Error ? saveError.message : "Failed to update transaction"; toast.error(errMsg); setError(errMsg);
    }
  };

  if (loading) {
    return (
      <section className={styles.page}>
        <article className={styles.card}>
          <LoadingSpinner fullScreen />
        </article>
      </section>
    );
  }

  if (!account) {
    return (
      <section className={styles.page}>
        <article className={styles.card}>
          <p className={styles.empty}>Account not found.</p>
          <p style={{ marginTop: "0.75rem" }}>
            <Link href="/" className={styles.backLink}>
              Back to Dashboard
            </Link>
          </p>
        </article>
      </section>
    );
  }

  const canGenerateInvoice =
    account.projectId !== null ||
    (typeof account.code === "string" && account.code.startsWith("PRJ-"));

  return (
    <section className={styles.page}>
      <article className={styles.card}>
        <h1 className={styles.title}>Account Transactions</h1>
        <p className={styles.subtitle}>
          {account.code} - {account.name}
        </p>
        <div className={styles.topActions}>
          {canGenerateInvoice && (
            <Link href={`/account/${accountId}/invoice`} className={styles.primaryButton}>
              Generate Invoice
            </Link>
          )}
          {!isReadOnly && (
            <>
              <button className={styles.primaryButton} type="button" onClick={() => setEditingAccount((v) => !v)}>
                Edit Account
              </button>
              <button
                className={styles.primaryButton}
                type="button"
                onClick={promptCloseAccount}
                disabled={account.isClosed}
              >
                {account.isClosed ? "Account Closed" : "Close Account"}
              </button>
              <button className={styles.primaryButton} type="button" onClick={promptCheckSelected}>
                Check Selected
              </button>
            </>
          )}
        </div>
        <p style={{ marginTop: "0.75rem" }}>
          <Link href="/" className={styles.backLink}>
            Back to Dashboard
          </Link>
        </p>

        {(message || error) && (
          <div className={styles.statusBlock}>
            {message && <p className={styles.successText}>{message}</p>}
            {error && <p className={styles.errorText}>{error}</p>}
          </div>
        )}

        {editingAccount && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalPanelWide}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Edit Account</h3>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => setEditingAccount(false)}
                >
                  Close
                </button>
              </div>
              <form className={styles.modalBody} onSubmit={saveAccount}>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%", maxWidth: "400px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "0.875rem", fontWeight: "500", color: "#374151" }}>Account Name</label>
                    <input
                      className={styles.input}
                      placeholder="e.g. Petty Cash"
                      value={accountForm.name}
                      onChange={(e) => setAccountForm((prev) => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "0.875rem", fontWeight: "500", color: "#374151" }}>Account Type</label>
                    <select
                      className={styles.input}
                      value={accountForm.type}
                      onChange={(e) =>
                        setAccountForm((prev) => ({ ...prev, type: e.target.value as AccountType }))
                      }
                    >
                      <option value="asset">Asset</option>
                      <option value="liability">Liability</option>
                      <option value="equity">Equity</option>
                      <option value="revenue">Revenue</option>
                      <option value="expense">Expense</option>
                    </select>
                  </div>
                  {accountForm.type === "expense" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <label style={{ fontSize: "0.875rem", fontWeight: "500", color: "#374151" }}>Sub Type</label>
                      <select
                        className={styles.input}
                        value={accountForm.subType}
                        onChange={(e) =>
                          setAccountForm((prev) => ({ ...prev, subType: e.target.value }))
                        }
                      >
                        <option value="none">Select Sub Type...</option>
                        <option value="Cost of Services">Cost of Services</option>
                        <option value="Administrative Expenses">Administrative Expenses</option>
                        <option value="Operating Expenses">Operating Expenses</option>
                        <option value="Financial Expenses">Financial Expenses</option>
                        <option value="Tax">Tax</option>
                        <option value="Other Expenses">Other Expenses</option>
                      </select>
                    </div>
                  )}
                  {accountForm.type === "revenue" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <label style={{ fontSize: "0.875rem", fontWeight: "500", color: "#374151" }}>Sub Type</label>
                      <select
                        className={styles.input}
                        value={accountForm.subType}
                        onChange={(e) =>
                          setAccountForm((prev) => ({ ...prev, subType: e.target.value }))
                        }
                      >
                        <option value="none">Select Sub Type...</option>
                        <option value="Service Revenue">Service Revenue</option>
                        <option value="Other Income">Other Income</option>
                      </select>
                    </div>
                  )}
                </div>
                <div className={styles.checkboxRow} style={{ marginTop: "15px" }}>
                  {(accountForm.type === "asset" || accountForm.type === "liability") && (
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <input
                        type="checkbox"
                        checked={accountForm.isCurrent}
                        onChange={(e) =>
                          setAccountForm((prev) => ({ ...prev, isCurrent: e.target.checked }))
                        }
                      />
                      Current
                    </label>
                  )}
                  {accountForm.type === "asset" && (
                    <>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <input
                          type="checkbox"
                          checked={accountForm.includeCashFlow}
                          onChange={(e) =>
                            setAccountForm((prev) => ({ ...prev, includeCashFlow: e.target.checked }))
                          }
                        />
                        Include in cash flow
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <input
                          type="checkbox"
                          checked={accountForm.isPaymentAccepting}
                          onChange={(e) =>
                            setAccountForm((prev) => ({ ...prev, isPaymentAccepting: e.target.checked }))
                          }
                        />
                        Payment accepting
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <input
                          type="checkbox"
                          checked={accountForm.isPettyCash}
                          onChange={(e) =>
                            setAccountForm((prev) => ({ ...prev, isPettyCash: e.target.checked }))
                          }
                        />
                        Petty cash
                      </label>
                    </>
                  )}
                </div>
                {accountForm.isPaymentAccepting && (
                  <div className={styles.formRowGroup} style={{ marginTop: "15px" }}>
                    <input
                      className={styles.input}
                      placeholder="Account Holder Name"
                      value={accountForm.accountHolderName || ""}
                      onChange={(e) => setAccountForm((prev) => ({ ...prev, accountHolderName: e.target.value }))}
                    />
                    <input
                      className={styles.input}
                      placeholder="Bank Name"
                      value={accountForm.bankName || ""}
                      onChange={(e) => setAccountForm((prev) => ({ ...prev, bankName: e.target.value }))}
                    />
                    <input
                      className={styles.input}
                      placeholder="Account Number"
                      value={accountForm.accountNumber || ""}
                      onChange={(e) => setAccountForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
                    />
                    <input
                      className={styles.input}
                      placeholder="Branch"
                      value={accountForm.bankBranch || ""}
                      onChange={(e) => setAccountForm((prev) => ({ ...prev, bankBranch: e.target.value }))}
                    />
                  </div>
                )}
                <div className={styles.actionsRow} style={{ marginTop: "1.5rem" }}>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={() => setEditingAccount(false)}
                  >
                    Cancel
                  </button>
                  <button className={styles.primaryButton} type="submit">Save Account</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </article>

      <article className={styles.card}>
        {ledger.length === 0 ? (
          <p className={styles.empty}>No transactions found for this account.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Affected Account</th>
                  <th>Debit</th>
                  <th>Credit</th>
                  <th>Document</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {ledger.some((row) => row.is_checked) && (
                  <tr className={styles.carriedRow}>
                    <td>
                      <button
                        type="button"
                        className={styles.expandButton}
                        onClick={() => setShowCheckedTransactions((prev) => !prev)}
                        aria-label={
                          showCheckedTransactions
                            ? "Hide checked transactions"
                            : "Show checked transactions"
                        }
                        title={
                          showCheckedTransactions
                            ? "Hide checked transactions"
                            : "Show checked transactions"
                        }
                      >
                        {showCheckedTransactions ? "\u25BC" : "\u25B6"}
                      </button>
                    </td>
                    <td colSpan={3}>Balance carried down from checked transactions</td>
                    <td>{checkedCarryDown.debit > 0 ? fmt(checkedCarryDown.debit) : "-"}</td>
                    <td>{checkedCarryDown.credit > 0 ? fmt(checkedCarryDown.credit) : "-"}</td>
                    <td>-</td>
                    <td>-</td>
                  </tr>
                )}
                {showCheckedTransactions &&
                  checkedRows.map((row) => (
                    <tr key={`checked-${row.entry_id}`} className={styles.checkedRow}>
                      <td>
                        <input type="checkbox" checked disabled />
                      </td>
                      <td>{new Date(row.date).toLocaleDateString()}</td>
                      <td>{row.description}</td>
                      <td>{row.affected_account}</td>
                      <td>{row.entry_type === "debit" ? fmt(Number(row.amount)) : "-"}</td>
                      <td>{row.entry_type === "credit" ? fmt(Number(row.amount)) : "-"}</td>
                      <td>
                        {row.document_link ? (
                          <a href={row.document_link} className={styles.docLink} target="_blank" rel="noreferrer">
                            View
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        <button className={styles.secondaryButton} type="button" disabled title="This transaction is verified in a bank statement and cannot be edited.">
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                {uncheckedRows.map((row) => (
                  <tr key={row.entry_id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedEntryIds.includes(row.entry_id)}
                        onChange={() => toggleEntrySelection(row.entry_id)}
                      />
                    </td>
                    <td>{new Date(row.date).toLocaleDateString()}</td>
                    <td>{row.description}</td>
                    <td>{row.affected_account}</td>
                    <td>{row.entry_type === "debit" ? fmt(Number(row.amount)) : "-"}</td>
                    <td>{row.entry_type === "credit" ? fmt(Number(row.amount)) : "-"}</td>
                    <td>
                      {row.document_link ? (
                        <a href={row.document_link} className={styles.docLink} target="_blank" rel="noreferrer">
                          View
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      <button
                        className={styles.secondaryButton}
                        type="button"
                        onClick={() => startTransactionEdit(row.transaction_id)}
                        disabled={checkedTransactionIds.has(row.transaction_id)}
                        title={
                          checkedTransactionIds.has(row.transaction_id)
                            ? "This transaction is verified in a bank statement and cannot be edited."
                            : ""
                        }
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={styles.differenceRow}>
                  <td colSpan={4}>Difference (shown on higher column)</td>
                  <td>{tableDifference.debit > 0 ? fmt(tableDifference.debit) : "-"}</td>
                  <td>{tableDifference.credit > 0 ? fmt(tableDifference.credit) : "-"}</td>
                  <td>-</td>
                  <td>-</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </article>

      {!isReadOnly && editingTransactionId !== null && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalPanel} style={{ maxWidth: "600px" }}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Edit Transaction #{editingTransactionId}</h3>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => setEditingTransactionId(null)}
              >
                Close
              </button>
            </div>
            <form className={styles.modalBody} onSubmit={saveTransactionEdit}>
              <div className={styles.formRowGroup}>
                <label className={styles.label}>
                  Description
                  <input
                    className={styles.input}
                    value={txForm.description}
                    onChange={(e) => setTxForm((prev) => ({ ...prev, description: e.target.value }))}
                    required
                  />
                </label>
                <label className={styles.label}>
                  Amount
                  <input
                    className={styles.input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={txForm.amount}
                    onChange={(e) => setTxForm((prev) => ({ ...prev, amount: e.target.value }))}
                    required
                  />
                </label>
              </div>

              <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
                <h4 style={{ fontSize: "0.9rem", color: "#475569", marginBottom: "0.5rem" }}>Affected Accounts</h4>
                {txForm.entries.map((entry, idx) => (
                  <div className={styles.editGrid} key={`${editingTransactionId}-${idx}`} style={{ gridTemplateColumns: "2fr 1fr", marginBottom: "0.5rem" }}>
                    <select
                      className={styles.input}
                      value={entry.accountId}
                      onChange={(e) =>
                        setTxForm((prev) => ({
                          ...prev,
                          entries: prev.entries.map((row, i) =>
                            i === idx ? { ...row, accountId: e.target.value } : row
                          ),
                        }))
                      }
                    >
                      {accountOptions
                        .filter((option) => !option.isClosed)
                        .map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.code} - {option.name}
                          </option>
                        ))}
                    </select>

                    <select
                      className={styles.input}
                      value={entry.entryType}
                      onChange={(e) =>
                        setTxForm((prev) => ({
                          ...prev,
                          entries: prev.entries.map((row, i) =>
                            i === idx
                              ? { ...row, entryType: e.target.value as "debit" | "credit" }
                              : row
                          ),
                        }))
                      }
                    >
                      <option value="debit">Debit</option>
                      <option value="credit">Credit</option>
                    </select>
                  </div>
                ))}
              </div>

              <div className={styles.actionsRow}>
                <button className={styles.secondaryButton} type="button" onClick={() => setEditingTransactionId(null)}>
                  Cancel
                </button>
                <button className={styles.primaryButton} type="submit">Save Transaction</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmModal.isOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalPanel} style={{ maxWidth: "450px" }}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Confirm Action</h3>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
              >
                &times;
              </button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ marginBottom: "1rem" }}>
                {confirmModal.action === "close" 
                  ? "Are you sure you want to close this account? This action cannot be undone."
                  : "Are you sure you want to check these selected transactions?"}
              </p>
              <p style={{ marginBottom: "1rem", fontSize: "0.9rem", color: "#64748b" }}>
                Please type <strong>confirm</strong> in the box below and click Confirm to proceed.
              </p>
              <input
                type="text"
                className={styles.input}
                value={confirmModal.inputText}
                onChange={(e) => setConfirmModal({ ...confirmModal, inputText: e.target.value })}
                placeholder="Type 'confirm' here"
                autoFocus
              />
              <div className={styles.modalActions} style={{ marginTop: "1.5rem" }}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={confirmModal.inputText.trim().toLowerCase() !== "confirm"}
                  onClick={() => {
                    if (confirmModal.inputText.trim().toLowerCase() === "confirm") {
                      setConfirmModal({ ...confirmModal, isOpen: false });
                      if (confirmModal.action === "close") {
                        closeAccount();
                      } else {
                        checkSelected();
                      }
                    }
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}


"use client";

import { useState, useEffect } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import styles from "./AdminDashboard.module.css";

type AccountRow = {
  id: number;
  name: string;
};

type FixedDepositRow = {
  id: number;
  bankName: string;
  accountNumber: string;
  amount: number;
  expectedInterest: number;
  startingDate: string;
  periodType: string;
  periodValue: number;
  status: string;
  referenceDocumentUrl: string | null;
  initialInvestmentAccountId?: number;
  initialInvestmentAccount: { name: string };
};

function getDisplayStatus(fd: FixedDepositRow) {
  if (fd.status !== "ACTIVE") return fd.status;

  const startDate = new Date(fd.startingDate);
  const endDate = new Date(startDate.getTime());
  
  if (fd.periodType === "months") {
    endDate.setMonth(endDate.getMonth() + fd.periodValue);
  } else if (fd.periodType === "days") {
    endDate.setDate(endDate.getDate() + fd.periodValue);
  }

  // Set time of both to midnight to only compare dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);

  if (today > endDate) {
    return "Deactive";
  }

  return fd.status;
}

export default function FixedDepositsDashboard() {
  const [fixedDeposits, setFixedDeposits] = useState<FixedDepositRow[]>([]);
  const [investmentAccounts, setInvestmentAccounts] = useState<AccountRow[]>([]);
  
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState<{
    bankName: string;
    accountNumber: string;
    initialInvestmentAccountId: string;
    startingDate: string;
    periodType: string;
    periodValue: string;
    amount: string;
    expectedInterest: string;
    referenceDocument: File | null;
  }>({
    bankName: "",
    accountNumber: "",
    initialInvestmentAccountId: "",
    startingDate: "",
    periodType: "months",
    periodValue: "",
    amount: "",
    expectedInterest: "",
    referenceDocument: null,
  });

  const [renewFd, setRenewFd] = useState<FixedDepositRow | null>(null);
  const [renewForm, setRenewForm] = useState<{ referenceDocument: File | null }>({ referenceDocument: null });

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/fixed-deposits");
      if (!res.ok) throw new Error("Failed to fetch fixed deposits");
      const data = await res.json();
      setFixedDeposits(data.fixedDeposits);
      setInvestmentAccounts(data.investmentAccounts);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (renewFd) {
      setSubmitting(true);
      await handleAction(renewFd.id, 'renew');
      setSubmitting(false);
      return;
    }

    setSubmitting(true);
    setMessage({ type: "", text: "" });

    try {
      const formData = new FormData();
      formData.append("bankName", form.bankName);
      formData.append("accountNumber", form.accountNumber);
      formData.append("initialInvestmentAccountId", form.initialInvestmentAccountId);
      formData.append("startingDate", form.startingDate);
      formData.append("periodType", form.periodType);
      formData.append("periodValue", form.periodValue);
      formData.append("amount", form.amount);
      formData.append("expectedInterest", form.expectedInterest);
      if (form.referenceDocument) {
        formData.append("referenceDocument", form.referenceDocument);
      }

      const url = editingId ? `/api/fixed-deposits/${editingId}` : "/api/fixed-deposits";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || (editingId ? "Failed to update fixed deposit" : "Failed to create fixed deposit"));
      }

      setMessage({ type: "success", text: editingId ? "Fixed deposit updated successfully" : "Fixed deposit created successfully" });
      setShowCreateForm(false);
      setEditingId(null);
      setForm({
        bankName: "",
        accountNumber: "",
        initialInvestmentAccountId: "",
        startingDate: "",
        periodType: "months",
        periodValue: "",
        amount: "",
        expectedInterest: "",
        referenceDocument: null,
      });
      fetchData();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (fd: FixedDepositRow) => {
    setEditingId(fd.id);
    setForm({
      bankName: fd.bankName,
      accountNumber: fd.accountNumber,
      initialInvestmentAccountId: fd.initialInvestmentAccountId ? String(fd.initialInvestmentAccountId) : "",
      startingDate: new Date(fd.startingDate).toISOString().split('T')[0],
      periodType: fd.periodType,
      periodValue: String(fd.periodValue),
      amount: String(fd.amount),
      expectedInterest: String(fd.expectedInterest || "0"),
      referenceDocument: null,
    });
    setShowCreateForm(true);
  };

  const handleRenewClick = (fd: FixedDepositRow) => {
    setRenewFd(fd);
    setForm({
      bankName: fd.bankName,
      accountNumber: fd.accountNumber,
      initialInvestmentAccountId: fd.initialInvestmentAccountId ? String(fd.initialInvestmentAccountId) : "",
      // new start date is a day after end date of previous term, but let's let user modify or just set it:
      startingDate: new Date().toISOString().split('T')[0],
      periodType: fd.periodType,
      periodValue: String(fd.periodValue),
      amount: String(fd.amount),
      expectedInterest: String(fd.expectedInterest || "0"),
      referenceDocument: null,
    });
    setShowCreateForm(true);
  };

  const handleAction = async (id: number, action: 'renew' | 'close') => {
    if (action === 'close' && !window.confirm(`Are you sure you want to close this Fixed Deposit?`)) return;

    try {
      const options: RequestInit = { method: 'POST' };

      if (action === 'renew') {
         const formData = new FormData();
         formData.append('periodType', form.periodType);
         formData.append('periodValue', form.periodValue);
         formData.append('expectedInterest', form.expectedInterest);
         if (form.referenceDocument) {
           formData.append('referenceDocument', form.referenceDocument);
         }
         options.body = formData;
      }

      const res = await fetch(`/api/fixed-deposits/${id}/${action}`, options);
              if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Failed to ${action} fixed deposit`);
      }
      setMessage({ type: "success", text: `Fixed Deposit ${action === 'renew' ? 'renewed' : 'closed'} successfully.` });
      fetchData();
      setShowCreateForm(false);
      setRenewFd(null);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <section className={styles.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 className={styles.sectionTitle}>Fixed Deposits</h2>
        <button className={styles.primaryButton} onClick={() => setShowCreateForm(true)}>
          + Create Fixed Deposit
        </button>
      </div>

      {message.text && (
        <div style={{ color: message.type === "error" ? "red" : "green", marginBottom: 16 }}>
          {message.text}
        </div>
      )}

      {showCreateForm && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalPanel}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>{renewFd ? "Renew Fixed Deposit" : (editingId ? "Edit Fixed Deposit" : "Create Fixed Deposit")}</h3>
              <button 
                className={styles.secondaryButton} 
                type="button" 
                onClick={() => {
                  setShowCreateForm(false)
                  setEditingId(null)
                  setRenewFd(null)
                  setForm({
                    bankName: "",
                    accountNumber: "",
                    initialInvestmentAccountId: "",
                    startingDate: "",
                    periodType: "months",
                    periodValue: "",
                    amount: "",
                    expectedInterest: "",
                    referenceDocument: null,
                  })
                }}
              >
                Close
              </button>
            </div>
            <form onSubmit={handleSubmit} className={styles.modalBody}>
              <div className={styles.formRow}>
                <label>Bank Name</label>
            <input
              type="text"
              required
              readOnly={!!renewFd}
              className={styles.input}
              value={form.bankName}
              onChange={(e) => setForm({ ...form, bankName: e.target.value })}
            />
          </div>
          <div className={styles.formRow}>
            <label>Fixed Account Number</label>
            <input
              type="text"
              required
              readOnly={!!renewFd}
              className={styles.input}
              value={form.accountNumber}
              onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
            />
          </div>
          <div className={styles.formRow}>
            <label>Initial Investment Bank Account</label>
            <select
              required
              disabled={!!renewFd}
              className={styles.input}
              value={form.initialInvestmentAccountId}
              onChange={(e) => setForm({ ...form, initialInvestmentAccountId: e.target.value })}
            >
              <option value="">Select Account</option>
              {investmentAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </div>
          <div className={styles.formRow}>
            <label>Starting Date</label>
            <input
              type="date"
              required
              readOnly={!!renewFd}
              className={styles.input}
              value={form.startingDate}
              onChange={(e) => setForm({ ...form, startingDate: e.target.value })}
            />
          </div>
          <div className={styles.formRow}>
            <label>Period Type</label>
            <select
              required
              className={styles.input}
              value={form.periodType}
              onChange={(e) => setForm({ ...form, periodType: e.target.value })}
            >
              <option value="days">Days</option>
              <option value="months">Months</option>
            </select>
          </div>
          <div className={styles.formRow}>
            <label>Period Value</label>
            <input
              type="number"
              required
              min="1"
              className={styles.input}
              value={form.periodValue}
              onChange={(e) => setForm({ ...form, periodValue: e.target.value })}
            />
          </div>
          <div className={styles.formRow}>
            <label>Amount (LKR)</label>
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              readOnly={!!renewFd}
              className={styles.input}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          <div className={styles.formRow}>
            <label>Expected Interest (LKR)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={styles.input}
              value={form.expectedInterest}
              onChange={(e) => setForm({ ...form, expectedInterest: e.target.value })}
            />
          </div>
          <div className={styles.formRow}>
            <label>Reference Document (Upload to Drive)</label>
            <input
              type="file"
              className={styles.input}
              onChange={(e) => setForm({ ...form, referenceDocument: e.target.files ? e.target.files[0] : null })}
            />
          </div>
          <div className={styles.actionsRowSimple}>
            <button type="submit" disabled={submitting} className={styles.primaryButton}>
              {submitting ? "Processing..." : (renewFd ? "Renew Fixed Deposit" : (editingId ? "Save Changes" : "Submit Fixed Deposit"))}
            </button>
          </div>
            </form>
          </div>
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Bank</th>
              <th>Account Details</th>
              <th>Amount</th>
              <th>Expected Interest</th>
              <th>Term</th>
              <th>Source</th>
              <th>Status</th>
              <th>Reference</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {fixedDeposits.map((fd) => (
              <tr key={fd.id}>
                <td>{fd.bankName}</td>
                <td>{fd.accountNumber}</td>
                <td>LKR {fd.amount}</td>
                <td>LKR {fd.expectedInterest}</td>
                <td>{fd.periodValue} {fd.periodType} (from {new Date(fd.startingDate).toLocaleDateString()})</td>
                <td>{fd.initialInvestmentAccount?.name}</td>
                  <td>
                    <span 
                      className={
                        getDisplayStatus(fd) === "Deactive" 
                          ? styles.failPill 
                          : getDisplayStatus(fd) === "ACTIVE" 
                            ? styles.passPill 
                            : ""
                      }
                    >
                      {getDisplayStatus(fd)}
                    </span>
                  </td>
                  <td>
                    {fd.referenceDocumentUrl ? (
                      <a href={fd.referenceDocumentUrl} target="_blank" rel="noopener noreferrer">View Doc</a>
                    ) : (
                      <span className={styles.emptyText}>No Doc</span>
                    )}
                  </td>
                  <td>
                    <div className={styles.actionsBox}>
                      <button 
                        onClick={() => handleEdit(fd)} 
                        className={styles.secondaryButton}
                        style={{ margin: "2px", padding: "4px 8px", fontSize: "0.8rem", width: "100%" }}
                      >
                        Edit
                      </button>
                      {getDisplayStatus(fd) === "Deactive" ? (
                        <>
                          <button 
                            onClick={() => handleRenewClick(fd)} 
                            className={styles.primaryButton}
                            style={{ margin: "2px", padding: "4px 8px", fontSize: "0.8rem", width: "100%" }}
                          >
                            Renew
                          </button>
                          <button 
                            onClick={() => handleAction(fd.id, 'close')} 
                            className={styles.rejectButton}
                            style={{ margin: "2px", padding: "4px 8px", fontSize: "0.8rem", width: "100%" }}
                          >
                            Close
                          </button>
                        </>
                      ) : (
                        null
                      )}
                    </div>
                  </td>
              </tr>
            ))}
            {fixedDeposits.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center" }}>No fixed deposits found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
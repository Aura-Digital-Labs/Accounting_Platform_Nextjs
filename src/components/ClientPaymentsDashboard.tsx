"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import styles from "./ClientPaymentsDashboard.module.css";

type Project = {
  id: string;
  code: string;
  name: string;
};

type PaymentAccount = {
  id: number;
  code: string;
  name: string;
  bankName?: string | null;
  accountHolderName?: string | null;
  accountNumber?: string | null;
  bankBranch?: string | null;
};

type ClientPayment = {
  id: string;
  title?: string;
  payment_account_id: number;
  amount: number;
  payment_date: string;
  description: string | null;
  document_link: string | null;
  status: string;
};

const paymentFormSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  paymentAccountId: z.coerce.number().int().positive("Payment account is required"),
  title: z.string().min(1, "Title is required").max(200, "Title must be 200 characters or less"),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  description: z.string().max(500, "Description must be 500 characters or less").optional(),
});

type PaymentFormInput = z.input<typeof paymentFormSchema>;
type PaymentFormOutput = z.output<typeof paymentFormSchema>;

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
    currency: "LKR",
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
  const s = String(status).toLowerCase();
  if (s === "approved") {
    return styles.statusApproved;
  }
  if (s === "approved_by_pm") {
    return styles.statusPending;
  }
  if (s === "rejected" || s === "rejected_by_pm") {
    return styles.statusRejected;
  }
  return styles.statusPending;
}

function statusLabel(status: string) {
  if (String(status).toLowerCase() === "approved_by_pm") {
    return "Approved By PM";
  }
  return String(status).toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function ClientPaymentsDashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [payments, setPayments] = useState<ClientPayment[]>([]);
  const [paymentSlip, setPaymentSlip] = useState<File | null>(null);

  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [fileError, setFileError] = useState("");
  const paymentSlipInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PaymentFormInput, unknown, PaymentFormOutput>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      projectId: "",
      paymentAccountId: "",
      title: "",
      amount: "",
      description: "",
    },
  });

  const accountNameMap = useMemo(
    () =>
      accounts.reduce<Record<number, React.ReactNode>>((acc, account) => {
        const hasBankDetails =
          account.bankName ||
          account.accountHolderName ||
          account.accountNumber ||
          account.bankBranch;
          
        if (hasBankDetails) {
          acc[account.id] = (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.85rem" }}>
              {account.bankName && <span>Bank: {account.bankName}</span>}
              {account.accountHolderName && <span>Name: {account.accountHolderName}</span>}
              {account.accountNumber && <span>Acc: {account.accountNumber}</span>}
              {account.bankBranch && <span>Branch: {account.bankBranch}</span>}
            </div>
          );
        } else {
          acc[account.id] = "No bank details provided";
        }
        
        return acc;
      }, {}),
    [accounts]
  );

  const projectOptions = projects.map((project) => ({
    value: String(project.id),
    label: `${project.code} - ${project.name}`,
  }));

  const accountOptions = accounts.map((account) => {
    return {
      value: String(account.id),
      account: account
    };
  });

  const selectedPaymentAccountId = watch("paymentAccountId");
  const selectedPaymentAccount = accounts.find((a) => String(a.id) === selectedPaymentAccountId);
  
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setAccountDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadDashboardData = async () => {
    setLoadingData(true);
    setFormError("");

    try {
      const [projectRes, accountRes, paymentRes] = await Promise.all([
        fetch("/api/projects", { cache: "no-store", credentials: "include" }),
        fetch("/api/accounts/payment-accepting", { cache: "no-store", credentials: "include" }),
        fetch("/api/client-payments", { cache: "no-store", credentials: "include" }),
      ]);

      if (!projectRes.ok) {
        throw new Error(await parseApiError(projectRes));
      }
      if (!accountRes.ok) {
        throw new Error(await parseApiError(accountRes));
      }
      if (!paymentRes.ok) {
        throw new Error(await parseApiError(paymentRes));
      }

      const [projectPayload, accountPayload, paymentPayload] = (await Promise.all([
        projectRes.json(),
        accountRes.json(),
        paymentRes.json(),
      ])) as [Project[], PaymentAccount[], ClientPayment[]];

      setProjects(projectPayload);
      setAccounts(accountPayload);
      setPayments(paymentPayload);
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Failed to load dashboard data");
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    void loadDashboardData();
  }, []);

  const onSubmit = async (values: PaymentFormOutput) => {
    setFormError("");
    setSuccessMessage("");
    setFileError("");

    if (!paymentSlip) {
      setFileError("Payment slip is required");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("project_id", String(values.projectId));
      formData.append("payment_account_id", String(values.paymentAccountId));
      formData.append("title", values.title.trim());
      formData.append("amount", Number(values.amount).toFixed(2));
      if (values.description?.trim()) {
        formData.append("description", values.description.trim());
      }
      formData.append("document_file", paymentSlip);

      const res = await fetch("/api/client-payments", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      setSuccessMessage("Payment submitted successfully.");
      reset({
        projectId: "",
        paymentAccountId: "",
        title: "",
        amount: "",
        description: "",
      });
      setPaymentSlip(null);
      if (paymentSlipInputRef.current) {
        paymentSlipInputRef.current.value = "";
      }
      await loadDashboardData();
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Failed to submit payment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <header className={styles.header}>
          <h1 className={styles.title}>Submit Project Payment</h1>
          <p className={styles.subtitle}>
            Submit your payment details and upload the payment slip for verification.
          </p>
        </header>

        {formError ? (
          <p className={styles.errorText}>{formError}</p>
        ) : null}
        {successMessage ? (
          <p className={styles.successText}>{successMessage}</p>
        ) : null}

        <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
          <div className={styles.formGrid}>
            <label className={styles.label} htmlFor="projectId">
              Project
            </label>
            <select
              id="projectId"
              className={styles.input}
              disabled={loadingData || submitting}
              {...register("projectId")}
            >
              <option value="">{loadingData ? "Loading projects..." : "Select project"}</option>
              {projectOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.projectId?.message ? <p className={styles.validationText}>{errors.projectId.message}</p> : null}

            <label className={styles.label} htmlFor="paymentAccountId">
              Payment Account
            </label>
            <div ref={dropdownRef} style={{ position: "relative" }}>
              <div 
                className={styles.input} 
                style={{ 
                  cursor: loadingData || submitting ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  minHeight: "42px",
                  lineHeight: "1.2"
                }}
                onClick={() => {
                  if (!loadingData && !submitting) {
                    setAccountDropdownOpen(!accountDropdownOpen);
                  }
                }}
              >
                {!selectedPaymentAccount ? (
                  <span style={{ color: "#64748b" }}>{loadingData ? "Loading accounts..." : "Select payment account"}</span>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "4px 0", fontSize: "0.85rem" }}>
                    {selectedPaymentAccount.bankName && <div><strong>Bank:</strong> {selectedPaymentAccount.bankName}</div>}
                    {selectedPaymentAccount.accountHolderName && <div><strong>Name:</strong> {selectedPaymentAccount.accountHolderName}</div>}
                    {selectedPaymentAccount.accountNumber && <div><strong>Acc:</strong> {selectedPaymentAccount.accountNumber}</div>}
                    {selectedPaymentAccount.bankBranch && <div><strong>Branch:</strong> {selectedPaymentAccount.bankBranch}</div>}
                    {!selectedPaymentAccount.bankName && !selectedPaymentAccount.accountHolderName && !selectedPaymentAccount.accountNumber && !selectedPaymentAccount.bankBranch && (
                      <div>No bank details provided</div>
                    )}
                  </div>
                )}
                <span style={{ marginLeft: "8px", fontSize: "0.8rem", color: "#64748b" }}>{"\u25BC"}</span>
              </div>
              
              {accountDropdownOpen && (
                <div style={{ 
                  position: "absolute", 
                  top: "100%", 
                  left: 0, 
                  right: 0, 
                  marginTop: "4px",
                  maxHeight: "300px", 
                  overflowY: "auto", 
                  backgroundColor: "white", 
                  border: "1px solid #d4dce9", 
                  borderRadius: "8px", 
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                  zIndex: 50 
                }}>
                  {accountOptions.map((option) => (
                    <div 
                      key={option.value}
                      style={{ 
                        padding: "10px 12px", 
                        borderBottom: "1px solid #f1f5f9",
                        cursor: "pointer",
                        backgroundColor: selectedPaymentAccountId === option.value ? "#f8fafc" : "transparent"
                      }}
                      onClick={() => {
                        setValue("paymentAccountId", option.value, { shouldValidate: true });
                        setAccountDropdownOpen(false);
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f1f5f9")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = selectedPaymentAccountId === option.value ? "#f8fafc" : "transparent")}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.85rem" }}>
                        {option.account.bankName && <div><strong>Bank:</strong> {option.account.bankName}</div>}
                        {option.account.accountHolderName && <div><strong>Name:</strong> {option.account.accountHolderName}</div>}
                        {option.account.accountNumber && <div><strong>Acc:</strong> {option.account.accountNumber}</div>}
                        {option.account.bankBranch && <div><strong>Branch:</strong> {option.account.bankBranch}</div>}
                        {!option.account.bankName && !option.account.accountHolderName && !option.account.accountNumber && !option.account.bankBranch && (
                          <div style={{ color: "#64748b" }}>No bank details provided</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {accountOptions.length === 0 && (
                    <div style={{ padding: "10px", color: "#64748b", textAlign: "center", fontSize: "0.9rem" }}>
                      No payment accounts available
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Hidden native input for react-hook-form registration and validation */}
            <input 
              type="hidden" 
              {...register("paymentAccountId")} 
            />

            {errors.paymentAccountId?.message ? (
              <p className={styles.validationText}>{errors.paymentAccountId.message}</p>
            ) : null}

            <label className={styles.label} htmlFor="amount">
              Title
            </label>
            <input
              id="title"
              className={styles.input}
              type="text"
              maxLength={200}
              placeholder="Payment title"
              disabled={submitting}
              {...register("title")}
            />
            {errors.title?.message ? <p className={styles.validationText}>{errors.title.message}</p> : null}

            <label className={styles.label} htmlFor="amount">
              Amount
            </label>
            <input
              id="amount"
              className={styles.input}
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              disabled={submitting}
              {...register("amount")}
            />
            {errors.amount?.message ? <p className={styles.validationText}>{errors.amount.message}</p> : null}

            <div />
            <div />
          </div>

          <div>
            <label className={styles.label} htmlFor="description">
              Description (Optional)
            </label>
            <input
              id="description"
              className={styles.input}
              placeholder="Payment note"
              disabled={submitting}
              {...register("description")}
            />
            {errors.description?.message ? <p className={styles.validationText}>{errors.description.message}</p> : null}
          </div>

          <div>
            <label className={styles.label} htmlFor="paymentSlip">
              Payment Slip
            </label>
            <input
              id="paymentSlip"
              ref={paymentSlipInputRef}
              className={styles.input}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              disabled={submitting}
              onChange={(event) => {
                setFileError("");
                setPaymentSlip(event.target.files?.[0] || null);
              }}
            />
            {paymentSlip?.name ? <p className={styles.helperText}>Selected: {paymentSlip.name}</p> : null}
            {fileError ? <p className={styles.validationText}>{fileError}</p> : null}
          </div>

          <div>
            <button
              type="submit"
              disabled={submitting || loadingData}
              className={styles.primaryButton}
            >
              {submitting ? "Submitting..." : "Submit Payment"}
            </button>
          </div>
        </form>
      </section>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>My Submitted Payments</h2>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Account</th>
                <th>Description</th>
                <th className={styles.numericCell}>Amount</th>
                <th>Document</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.emptyCell}>
                    No payments submitted yet.
                  </td>
                </tr>
              ) : (
                payments.map((row) => (
                  <tr key={row.id}>
                    <td>#{row.id}</td>
                    <td>{formatDate(row.payment_date)}</td>
                    <td>{accountNameMap[row.payment_account_id] || `#${row.payment_account_id}`}</td>
                    <td>{row.title || row.description || "-"}</td>
                    <td className={styles.numericCell}>{formatCurrency(row.amount)}</td>
                    <td>
                      {row.document_link ? (
                        <a className={styles.linkText} href={row.document_link} target="_blank" rel="noreferrer">
                          View
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      <span className={`${styles.statusBadge} ${statusClassName(row.status)}`}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

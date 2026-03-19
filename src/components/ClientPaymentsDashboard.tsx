"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import styles from "./ClientPaymentsDashboard.module.css";

type Project = {
  id: number;
  code: string;
  name: string;
};

type PaymentAccount = {
  id: number;
  code: string;
  name: string;
};

type ClientPayment = {
  id: number;
  payment_account_id: number;
  amount: number;
  payment_date: string;
  description: string | null;
  document_link: string | null;
  status: string;
};

const paymentFormSchema = z.object({
  projectId: z.coerce.number().int().positive("Project is required"),
  paymentAccountId: z.coerce.number().int().positive("Payment account is required"),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  paymentDate: z.string().min(1, "Payment date is required"),
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
    formState: { errors },
  } = useForm<PaymentFormInput, unknown, PaymentFormOutput>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      projectId: "",
      paymentAccountId: "",
      amount: "",
      paymentDate: "",
      description: "",
    },
  });

  const accountNameMap = useMemo(
    () =>
      accounts.reduce<Record<number, string>>((acc, account) => {
        acc[account.id] = `${account.code} - ${account.name}`;
        return acc;
      }, {}),
    [accounts]
  );

  const projectOptions = projects.map((project) => ({
    value: String(project.id),
    label: `${project.code} - ${project.name}`,
  }));

  const accountOptions = accounts.map((account) => ({
    value: String(account.id),
    label: `${account.code} - ${account.name}`,
  }));

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
      formData.append("amount", Number(values.amount).toFixed(2));
      formData.append("payment_date", values.paymentDate);
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
        amount: "",
        paymentDate: "",
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
            <select
              id="paymentAccountId"
              className={styles.input}
              disabled={loadingData || submitting}
              {...register("paymentAccountId")}
            >
              <option value="">{loadingData ? "Loading accounts..." : "Select payment account"}</option>
              {accountOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.paymentAccountId?.message ? (
              <p className={styles.validationText}>{errors.paymentAccountId.message}</p>
            ) : null}

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

            <label className={styles.label} htmlFor="paymentDate">
              Date
            </label>
            <input
              id="paymentDate"
              className={styles.input}
              type="date"
              disabled={submitting}
              {...register("paymentDate")}
            />
            {errors.paymentDate?.message ? <p className={styles.validationText}>{errors.paymentDate.message}</p> : null}
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
                    <td>{row.description || "-"}</td>
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

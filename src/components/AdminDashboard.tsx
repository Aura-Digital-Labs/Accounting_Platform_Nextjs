"use client";

import LoadingSpinner from '@/components/LoadingSpinner';
import toast from 'react-hot-toast';
import Link from 'next/link';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./AdminDashboard.module.css";
import PendingExpensesTable, { PendingExpenseGroup } from "./PendingExpensesTable";
import BankStatementsDashboard from "./BankStatementsDashboard";
import DashboardOverview from "./DashboardOverview";

type UserRow = {
  id: string;
  email: string;
  username: string | null;
  name?: string;
  full_name: string;
  role: "admin" | "financial_officer" | "employee" | "project_manager" | "client";
};

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  budget: number;
  status: string | null;
  finance_status?: string | null;
  account_id: number;
  client_id: string | null;
  user_ids?: string[];
  employee_ids?: string[];
  client_ids?: string[];
};

type AccountRow = {
  id: number;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  projectId: string | null;
  includeCashFlow: boolean;
  isPaymentAccepting: boolean;
  isPettyCash: boolean;
  isClosed: boolean;
  bankName?: string | null;
  accountNumber?: string | null;
};

type TrialBalanceRow = {
  account_id: number;
  code: string;
  name: string;
  debits: number;
  credits: number;
};

type HealthReport = {
  double_entry_balanced: boolean;
  accounting_equation_balanced: boolean;
  unchecked_transactions: number;
  unchecked_accounts_breakdown: { account_id: number; count: number }[];
};

type CashFlowReport = {
  cash_inflow: number;
  cash_outflow: number;
  net_cash_flow: number;
};

type ExpenseRow = {
  id: string;
  projectId: string;
  employeeId: string;
  description: string;
  amount: number;
  expenseDate: string;
  receiptPath: string | null;
  finalExpenseAmount: number | null;
  status: "pending" | "approved_by_pm" | "approved" | "rejected" | "rejected_by_pm";
  lineItems?: {
    id: string;
    projectId?: string;
    project?: string;
    amountOriginal: number;
    amountFinal: number;
  }[];
};

type PaymentRow = {
  id: string;
  project_id: string;
  client_id: string;
  project_name: string;
  client_name: string | null;
  payment_account_id: number;
  title?: string;
  amount: number;
  payment_date: string;
  description: string | null;
  document_link: string | null;
  status: "pending" | "approved_by_pm" | "approved" | "rejected" | "rejected_by_pm";
  pm_approval_notes: string | null;
};

type ProjectManagerRow = {
  id: string;
  email: string;
  username: string | null;
  name?: string;
  full_name: string;
  petty_cash_account_id: number | null;
  managed_project_ids: string[];
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
};

type TransactionRow = {
  id: number;
  description: string;
  posted_at: string;
  entries: {
    account_id: number;
    entry_type: "debit" | "credit";
    amount: number;
  }[];
};

type DashboardPayload = {
  users: UserRow[];
  projects: ProjectRow[];
  accounts: AccountRow[];
  expenses: ExpenseRow[];
  payments: PaymentRow[];
  pms: ProjectManagerRow[];
  health: HealthReport;
  cashFlow: CashFlowReport;
  trialBalance: TrialBalanceRow[];
  transactions: TransactionRow[];
  bankStatements: any[];
  fixedDeposits: FixedDepositRow[];
};

type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

const EMPTY_PAYLOAD: DashboardPayload = {
  users: [],
  projects: [],
  accounts: [],
  expenses: [],
  payments: [],
  pms: [],
  health: {
    double_entry_balanced: true,
    accounting_equation_balanced: true,
    unchecked_transactions: 0,
    unchecked_accounts_breakdown: [],
  },
  cashFlow: {
    cash_inflow: 0,
    cash_outflow: 0,
    net_cash_flow: 0,
  },
  trialBalance: [],
  transactions: [],
  bankStatements: [],
  fixedDeposits: [],
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}

async function readJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", credentials: "include" });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const detail =
      typeof payload === "object" &&
      payload !== null &&
      "detail" in payload &&
      typeof (payload as { detail?: unknown }).detail === "string"
        ? (payload as { detail: string }).detail
        : `Request failed: ${res.status}`;
    throw new Error(detail);
  }

  return payload as T;
}

type SelectOption = {
  id: string;
  label: string;
};

function SearchableMultiSelect({
  title,
  options,
  selectedIds,
  onToggle,
  placeholder,
  emptyText,
}: {
  title: string;
  options: SelectOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  placeholder: string;
  emptyText: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectedOptions = useMemo(
    () => options.filter((option) => selectedSet.has(option.id)),
    [options, selectedSet]
  );

  const filteredOptions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) => option.label.toLowerCase().includes(term));
  }, [options, query]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!wrapperRef.current || !target) return;
      if (!wrapperRef.current.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  return (
    <div className={styles.multiSelectWrap} ref={wrapperRef}>
      <h4 className={styles.subTitle}>{title}</h4>

      <div className={styles.selectedSlotWrap}>
        {selectedOptions.length === 0 ? (
          <p className={styles.slotHelperText}>No selections yet.</p>
        ) : (
          selectedOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={styles.slotChip}
              onClick={() => onToggle(option.id)}
              title="Click to remove"
            >
              {option.label}
              <span className={styles.slotChipClose}>x</span>
            </button>
          ))
        )}
      </div>

      <div className={styles.searchDropdownWrap}>
        <input
          className={styles.input}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
        />

        {open && (
          <div className={styles.searchDropdownPanel}>
            {filteredOptions.length === 0 ? (
              <p className={styles.dropdownEmpty}>{emptyText}</p>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = selectedSet.has(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={isSelected ? styles.dropdownOptionSelected : styles.dropdownOption}
                    onMouseDown={(e) => {
                      e.preventDefault();
                    }}
                    onClick={() => onToggle(option.id)}
                  >
                    <span>{option.label}</span>
                    <span>{isSelected ? "Selected" : "Add"}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboard({
  displayName,
  dashboardTitle = "Admin Dashboard",
  isReadOnly = false,
  bottomContent,
  viewMode = "all", // "all", "overview", "detailed", "employees", "projects", "custom-accounts", "bank"
}: {
  displayName: string;
  dashboardTitle?: string;
  isReadOnly?: boolean;
  bottomContent?: React.ReactNode;
  viewMode?: "all" | "overview" | "detailed" | "employees" | "projects" | "custom-accounts" | "bank";
}) {
  const [data, setData] = useState<DashboardPayload>(EMPTY_PAYLOAD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [showClosedAccounts, setShowClosedAccounts] = useState(false);
  const [showPendingProjects, setShowPendingProjects] = useState(false);

  const [creatingAccountForProjectId, setCreatingAccountForProjectId] = useState<string | null>(null);
  const [pendingAccountForm, setPendingAccountForm] = useState({ code: "", name: "" });

  const [projectSearchFilter, setProjectSearchFilter] = useState("");
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);

  const [userForm, setUserForm] = useState<{
    fullName: string;
    email: string;
    password: string;
    role: "admin" | "financial_officer" | "employee" | "project_manager" | "client";
    pettyCashAccountId: string;
    selectedProjects: string[];
  }>({
    fullName: "",
    email: "",
    password: "",
    role: "employee",
    pettyCashAccountId: "",
    selectedProjects: []
  });
  const [pmForm, setPmForm] = useState({
    fullName: "",
    email: "",
    password: "",
    pettyCashAccountId: "",
  });
  const [projectForm, setProjectForm] = useState({ name: "", budget: "", description: "" });
  const [createProjectEmployeeIds, setCreateProjectEmployeeIds] = useState<string[]>([]);
  const [createProjectClientIds, setCreateProjectClientIds] = useState<string[]>([]);
  const [accountForm, setAccountForm] = useState({
    code: "",
    name: "",
    type: "asset" as AccountType,
    includeCashFlow: false,
    isPaymentAccepting: false,
    isPettyCash: false,
    accountNumber: "",
    accountHolderName: "",
    bankName: "",
    bankBranch: "",
  });

  const [editingPmId, setEditingPmId] = useState<string | null>(null);
  const [editPmPettyCash, setEditPmPettyCash] = useState("");
  const [editPmProjects, setEditPmProjects] = useState<string[]>([]);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectForm, setEditProjectForm] = useState({
    name: "",
    budget: "",
    description: "",
    employeeIds: [] as string[],
    clientIds: [] as string[],
  });

  const [txDescription, setTxDescription] = useState("");
  const [txValue, setTxValue] = useState("");
  const [txDebitAccountId, setTxDebitAccountId] = useState("");
  const [txCreditAccountId, setTxCreditAccountId] = useState("");
  const [txSupportingDocument, setTxSupportingDocument] = useState<File | null>(null);

  const clearStatus = () => {
    setError("");
    setSuccess("");
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    clearStatus();

    try {
      const [
        users,
        projects,
        accounts,
        expenses,
        payments,
        pms,
        health,
        cashFlow,
        trialBalance,
        transactions,
        bankStatements,
        fdData,
      ] = await Promise.all([
        readJson<UserRow[]>("/api/users"),
        readJson<ProjectRow[]>("/api/projects"),
        readJson<AccountRow[]>("/api/accounts?include_closed=true"),
        readJson<ExpenseRow[]>("/api/expenses"),
        readJson<PaymentRow[]>("/api/client-payments"),
        readJson<ProjectManagerRow[]>("/api/users/project-managers"),
        readJson<HealthReport>("/api/reports/health"),
        readJson<CashFlowReport>("/api/reports/cash-flow"),
        readJson<TrialBalanceRow[]>("/api/reports/trial-balance"),
        readJson<TransactionRow[]>("/api/transactions"),
        readJson<any[]>("/api/bank-statements/all"),
        readJson<{ fixedDeposits: FixedDepositRow[] }>("/api/fixed-deposits"),
      ]);

      setData({
        users,
        projects,
        accounts,
        expenses,
        payments,
        pms,
        health,
        cashFlow,
        trialBalance,
        transactions,
        bankStatements,
        fixedDeposits: fdData.fixedDeposits || [],
      });
    } catch (loadError) {
      const errMsg = loadError instanceof Error ? loadError.message : "Failed to load dashboard data"; toast.error(errMsg); setError(errMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const trialMap = useMemo(() => {
    const map = new Map<number, TrialBalanceRow>();
    data.trialBalance.forEach((row) => map.set(row.account_id, row));
    return map;
  }, [data.trialBalance]);

  const accountMap = useMemo(() => {
    const map = new Map<number, AccountRow>();
    data.accounts.forEach((account) => map.set(account.id, account));
    return map;
  }, [data.accounts]);

  const projectMap = useMemo(() => {
    const map = new Map<string, ProjectRow>();
    data.projects.forEach((p) => map.set(p.id, p));
    return map;
  }, [data.projects]);

  const accountBalance = useCallback(
    (account: AccountRow | undefined) => {
      if (!account) return 0;
      const row = trialMap.get(account.id);
      if (!row) return 0;

      if (account.type === "asset" || account.type === "expense") {
        return Number((row.debits - row.credits).toFixed(2));
      }
      return Number((row.credits - row.debits).toFixed(2));
    },
    [trialMap]
  );

  const pendingExpenses = useMemo(
    () => data.expenses.filter((e) => e.status === "pending" || e.status === "approved_by_pm"),
    [data.expenses]
  );

  const pendingExpenseGroups = useMemo<PendingExpenseGroup[]>(() => {
    const statusLabel = (status: ExpenseRow["status"]): PendingExpenseGroup["pmReviewStatus"] => {
      if (status === "approved") return "Approved";
      if (status === "rejected" || status === "rejected_by_pm") return "Declined";
      if (status === "approved_by_pm") return "In Review";
      return "Pending";
    };

    const grouped = new Map<string, PendingExpenseGroup>();

    pendingExpenses.forEach((expense) => {
      const employee = data.users.find((u) => u.id === expense.employeeId);
      const employer =
        employee?.full_name || employee?.username || employee?.email || `Employee #${expense.employeeId}`;

      const key = [
        expense.employeeId,
        expense.expenseDate,
        expense.description,
      ].join("|");

      const existing = grouped.get(key);
      const fallbackFinal =
        expense.finalExpenseAmount !== null ? Number(expense.finalExpenseAmount) : Number(expense.amount);

      const rows =
        expense.lineItems && expense.lineItems.length > 0
          ? expense.lineItems.map((item, idx) => {
              const itemProject =
                item.project ||
                (typeof item.projectId === "string"
                  ? data.projects.find((p) => p.id === item.projectId)
                  : data.projects.find((p) => p.id === expense.projectId));

              return {
                id: String(item.id || `${expense.id}-${idx + 1}`),
                expenseId: expense.id,
                project:
                  typeof itemProject === "string"
                    ? itemProject
                    : itemProject
                      ? `${itemProject.code} - ${itemProject.name}`
                      : `Project #${item.projectId ?? expense.projectId}`,
                amountOriginal: Number(item.amountOriginal),
                amountFinal: Number(item.amountFinal),
                reviewLabel: "Review",
              };
            })
          : [
              {
                id: `${expense.id}-1`,
                expenseId: expense.id,
                project: (() => {
                  const project = data.projects.find((p) => p.id === expense.projectId);
                  return project ? `${project.code} - ${project.name}` : `Project #${expense.projectId}`;
                })(),
                amountOriginal: Number(expense.amount),
                amountFinal: fallbackFinal,
                reviewLabel: "Review",
              },
            ];

      if (!existing) {
        grouped.set(key, {
          id: expense.id,
          date: expense.expenseDate,
          employer,
          description: expense.description,
          project: "",
          pmReviewStatus: statusLabel(expense.status),
          documentUrl: expense.receiptPath,
          lineItems: rows,
        });
        return;
      }

      existing.lineItems.push(...rows);
      if (!existing.documentUrl && expense.receiptPath) {
        existing.documentUrl = expense.receiptPath;
      }
      if (existing.pmReviewStatus === "Pending" && statusLabel(expense.status) !== "Pending") {
        existing.pmReviewStatus = statusLabel(expense.status);
      }
    });

    return Array.from(grouped.values());
  }, [pendingExpenses, data.users, data.projects]);

  const pendingPayments = useMemo(
    () => data.payments.filter((p) => {
      const s = String(p.status).toLowerCase();
      return s === "pending" || s === "approved_by_pm";
    }),
    [data.payments]
  );

  const customAccounts = useMemo(
    () =>
      data.accounts.filter(
        (a) =>
          a.projectId === null &&
          !a.code.toUpperCase().startsWith("EMP-") &&
          !a.code.toUpperCase().startsWith("PRJ-")
      ),
    [data.accounts]
  );

  const employerAccounts = useMemo(() => {
    const employees = data.users.filter(
      (u) =>
        u.role === "employee" ||
        u.role === "project_manager" ||
        u.role === "financial_officer"
    );
    return employees.map((employee) => {
      const account = data.accounts.find((a) => a.code === `EMP-${employee.id}`);
      return {
        ...employee,
        accountId: account?.id || null,
        accountCode: account?.code || "-",
        balance: accountBalance(account),
      };
    });
  }, [data.users, data.accounts, accountBalance]);

  const projectAccounts = useMemo(
    () =>
      data.projects
        .filter((project) => !!project.account_id)
        .map((project) => {
          const account = accountMap.get(project.account_id);
          const balance = accountBalance(account);

          const hasPending =
            pendingExpenses.some((e) => 
              e.projectId === project.id || (e.lineItems && e.lineItems.some(li => li.projectId === project.id))
            ) ||
            pendingPayments.some((p) => p.project_id === project.id);

          let calculatedFinanceStatus = "Payment Required";
          if (hasPending) {
            calculatedFinanceStatus = "Outdated";
          } else if (Math.abs(balance) === 0) {
            calculatedFinanceStatus = "Ready to Deliver";
          }

          return {
            ...project,
            accountName: account?.name || "-",
            accountBalance: balance,
            calculatedFinanceStatus,
          };
        }),
    [data.projects, accountMap, accountBalance, pendingExpenses, pendingPayments]
  );

  useEffect(() => {
    if (isReadOnly || data.projects.length === 0) return;
    
    // Find projects where finance_status differs from calculatedFinanceStatus
    const updates = projectAccounts
      .filter((p) => p.finance_status !== p.calculatedFinanceStatus)
      .map((p) => ({
        id: p.id,
        finance_status: p.calculatedFinanceStatus,
      }));

    if (updates.length > 0) {
      fetch("/api/projects/finance-status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      })
        .then((res) => {
          if (res.ok) {
            setData((prev) => ({
              ...prev,
              projects: prev.projects.map((p) => {
                const update = updates.find((u) => u.id === p.id);
                return update ? { ...p, finance_status: update.finance_status } : p;
              }),
            }));
          }
        })
        .catch(console.error);
    }
  }, [projectAccounts, data.projects, isReadOnly]);

  const pendingProjects = useMemo(
    () =>
      data.projects.filter(
        (project) =>
          !project.account_id &&
          (project.status === "IN_PROGRESS" || project.status === "ON_HOLD")
      ),
    [data.projects]
  );

  const employeeUsers = useMemo(
    () => data.users.filter((user) => user.role === "employee"),
    [data.users]
  );

  const clientUsers = useMemo(
    () => data.users.filter((user) => user.role === "client"),
    [data.users]
  );

  const employeeUserOptions = useMemo(
    () =>
      employeeUsers.map((user) => ({
        id: user.id,
        label: `${user.full_name} (${user.email})`,
      })),
    [employeeUsers]
  );

  const clientUserOptions = useMemo(
    () =>
      clientUsers.map((user) => ({
        id: user.id,
        label: `${user.full_name} (${user.email})`,
      })),
    [clientUsers]
  );

  const closedAccounts = useMemo(
    () => data.accounts.filter((account) => account.isClosed),
    [data.accounts]
  );

  const pettyCashAccounts = useMemo(
    () => data.accounts.filter((a) => a.isPettyCash && !a.isClosed),
    [data.accounts]
  );

  const cashFlowTransactions = useMemo(() => {
    const cashFlowAccountIds = new Set(
      data.accounts.filter((a) => a.includeCashFlow).map((a) => a.id)
    );

    return data.transactions
      .map((tx) => {
        let inflow = 0;
        let outflow = 0;

        for (const entry of tx.entries) {
          if (!cashFlowAccountIds.has(entry.account_id)) continue;
          if (entry.entry_type === "debit") inflow += Number(entry.amount);
          if (entry.entry_type === "credit") outflow += Number(entry.amount);
        }

        return {
          id: tx.id,
          date: tx.posted_at,
          description: tx.description,
          inflow,
          outflow,
        };
      })
      .filter((row) => row.inflow > 0 || row.outflow > 0);
  }, [data.transactions, data.accounts]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    clearStatus();

    if (!userForm.fullName || !userForm.email || !userForm.password) {
      toast.error("Please fill out all required fields."); setError("Please fill out all required fields.");
      return;
    }
    
    if (userForm.role === "project_manager" && !userForm.pettyCashAccountId) {
      toast.error("Please select a petty cash account for the PM."); setError("Please select a petty cash account for the PM.");
      return;
    }

    try {
      const endpoint = userForm.role === "project_manager" ? "/api/users/project-managers" : "/api/users";
      
      const payload: any = {
        name: userForm.fullName,
        email: userForm.email,
        password: userForm.password,
        role: userForm.role,
      };
      
      if (userForm.role === "project_manager") {
         payload.petty_cash_account_id = Number(userForm.pettyCashAccountId);
      }

      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const payloadData = (await res.json()) as { detail?: string };
        throw new Error(payloadData.detail || "Failed to create user");
      }

      const createdUser = await res.json();
      
      // Handle PM projects
      if (userForm.role === "project_manager" && userForm.selectedProjects.length > 0) {
         await fetch(`/api/users/project-managers/${createdUser.id}/assignments`, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ project_ids: userForm.selectedProjects })
         });
      }
      
      // Handle Client / Employee projects 
      if ((userForm.role === "employee" || userForm.role === "client") && userForm.selectedProjects.length > 0) {
         for (const projectId of userForm.selectedProjects) {
            const project = data.projects.find(p => p.id === projectId);
            if (!project) continue;
            
            const patchPayload: any = {};
            if (userForm.role === "employee") {
               patchPayload.employee_ids = [...(project.employee_ids || []), createdUser.id];
               patchPayload.client_ids = project.client_ids || [];
            } else if (userForm.role === "client") {
               patchPayload.client_ids = [...(project.client_ids || []), createdUser.id];
               patchPayload.employee_ids = project.employee_ids || [];
            }
            
            patchPayload.user_ids = Array.from(new Set([...(project.user_ids || []), createdUser.id]));
            patchPayload.budget = Number(project.budget);
            patchPayload.account_id = Number(project.account_id);
            
            await fetch(`/api/projects/${projectId}`, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patchPayload)
            });
         }
      }

      toast.success("User created successfully."); setSuccess("User created successfully.");
      setUserForm({ fullName: "", email: "", password: "", role: "employee", pettyCashAccountId: "", selectedProjects: [] });
      setShowCreateUser(false);
      await loadData();
    } catch (createError) {
      const errMsg = createError instanceof Error ? createError.message : "Failed to create user"; toast.error(errMsg); setError(errMsg);
    }
  };

  const createProject = async (e: FormEvent) => {
    e.preventDefault();
    clearStatus();

    try {
      const projectCode = `${projectForm.name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 8) || "PRJ"}-${Date.now().toString().slice(-5)}`;

      const res = await fetch("/api/projects", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: projectCode,
          name: projectForm.name,
          budget: Number(projectForm.budget || 0),
          description: projectForm.description || null,
          user_ids: createProjectEmployeeIds,
          client_ids: createProjectClientIds,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json()) as { detail?: string };
        throw new Error(payload.detail || "Failed to create project");
      }

      toast.success("Project created."); setSuccess("Project created.");
      setProjectForm({ name: "", budget: "", description: "" });
      setCreateProjectEmployeeIds([]);
      setCreateProjectClientIds([]);
      setShowCreateProject(false);
      await loadData();
    } catch (createError) {
      const errMsg = createError instanceof Error ? createError.message : "Failed to create project"; toast.error(errMsg); setError(errMsg);
    }
  };

  const createAccountForProject = async (projectId: string) => {
    clearStatus();
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const payload = (await res.json()) as { detail?: string };
        throw new Error(payload.detail || "Failed to create project account");
      }

      toast.success("Account automatically created and linked to project"); setSuccess("Account automatically created and linked to project");
      await loadData();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Failed to create account"
      );
    }
  };

  const createCustomAccount = async (e: FormEvent) => {
    e.preventDefault();
    clearStatus();

    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: accountForm.code,
          name: accountForm.name,
          type: accountForm.type,
          includeCashFlow: accountForm.includeCashFlow,
          isPaymentAccepting: accountForm.isPaymentAccepting,
          isPettyCash: accountForm.isPettyCash,
          accountNumber: accountForm.accountNumber || null,
          accountHolderName: accountForm.accountHolderName || null,
          bankName: accountForm.bankName || null,
          bankBranch: accountForm.bankBranch || null,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json()) as { detail?: string };
        throw new Error(payload.detail || "Failed to create account");
      }

      toast.success("Custom account created."); setSuccess("Custom account created.");
      setAccountForm({
        code: "",
        name: "",
        type: "asset",
        includeCashFlow: false,
        isPaymentAccepting: false,
        isPettyCash: false,
        accountNumber: "",
        accountHolderName: "",
        bankName: "",
        bankBranch: "",
      });
      setShowCreateAccount(false);
      await loadData();
    } catch (createError) {
      const errMsg = createError instanceof Error ? createError.message : "Failed to create account"; toast.error(errMsg); setError(errMsg);
    }
  };

  const beginEditPm = (pm: ProjectManagerRow) => {
    setEditingPmId(pm.id);
    setEditPmPettyCash(pm.petty_cash_account_id ? String(pm.petty_cash_account_id) : "");
    setEditPmProjects(pm.managed_project_ids);
  };

  const toggleProjectSelection = (projectId: string) => {
    setEditPmProjects((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
    );
  };

  const toggleCreateProjectEmployee = (employeeId: string) => {
    setCreateProjectEmployeeIds((prev) =>
      prev.includes(employeeId)
        ? prev.filter((id) => id !== employeeId)
        : [...prev, employeeId]
    );
  };

  const toggleCreateProjectClient = (clientId: string) => {
    setCreateProjectClientIds((prev) =>
      prev.includes(clientId)
        ? prev.filter((id) => id !== clientId)
        : [...prev, clientId]
    );
  };

  const beginEditProject = (project: ProjectRow) => {
    setEditingProjectId(project.id);
    setEditProjectForm({
      name: project.name,
      budget: String(Number(project.budget || 0)),
      description: project.description || "",
      employeeIds: project.employee_ids || [],
      clientIds: project.client_ids || [],
    });
  };

  const toggleEditProjectEmployee = (employeeId: string) => {
    setEditProjectForm((prev) => ({
      ...prev,
      employeeIds: prev.employeeIds.includes(employeeId)
        ? prev.employeeIds.filter((id) => id !== employeeId)
        : [...prev.employeeIds, employeeId],
    }));
  };

  const toggleEditProjectClient = (clientId: string) => {
    setEditProjectForm((prev) => ({
      ...prev,
      clientIds: prev.clientIds.includes(clientId)
        ? prev.clientIds.filter((id) => id !== clientId)
        : [...prev.clientIds, clientId],
    }));
  };

  const saveProjectEdit = async () => {
    if (!editingProjectId) return;
    clearStatus();

    try {
      const res = await fetch(`/api/projects/${editingProjectId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editProjectForm.name,
          budget: Number(editProjectForm.budget || 0),
          description: editProjectForm.description || null,
          user_ids: editProjectForm.employeeIds,
          client_ids: editProjectForm.clientIds,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json()) as { detail?: string };
        throw new Error(payload.detail || "Failed to update project");
      }

      toast.success("Project updated."); setSuccess("Project updated.");
      setEditingProjectId(null);
      await loadData();
    } catch (saveError) {
      const errMsg = saveError instanceof Error ? saveError.message : "Failed to update project"; toast.error(errMsg); setError(errMsg);
    }
  };

  const savePmEdit = async () => {
    if (!editingPmId) return;
    clearStatus();

    try {
      const patchRes = await fetch(`/api/users/project-managers/${editingPmId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petty_cash_account_id: editPmPettyCash ? Number(editPmPettyCash) : null,
        }),
      });

      if (!patchRes.ok) {
        const payload = (await patchRes.json()) as { detail?: string };
        throw new Error(payload.detail || "Failed to update PM");
      }

      const assignmentsRes = await fetch(
        `/api/users/project-managers/${editingPmId}/assignments`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_ids: editPmProjects }),
        }
      );

      if (!assignmentsRes.ok) {
        const payload = (await assignmentsRes.json()) as { detail?: string };
        throw new Error(payload.detail || "Failed to update PM assignments");
      }

      toast.success("Project manager updated."); setSuccess("Project manager updated.");
      setEditingPmId(null);
      setEditPmPettyCash("");
      setEditPmProjects([]);
      await loadData();
    } catch (saveError) {
      const errMsg = saveError instanceof Error ? saveError.message : "Failed to save PM changes"; toast.error(errMsg); setError(errMsg);
    }
  };

  const clearTransactionForm = () => {
    setTxDescription("");
    setTxValue("");
    setTxDebitAccountId("");
    setTxCreditAccountId("");
    setTxSupportingDocument(null);
    toast.success("Transaction form cleared.");
    setError("");
  };

  const postTransaction = async (e: FormEvent) => {
    e.preventDefault();
    clearStatus();

    if (!txDescription.trim() || !txValue || !txDebitAccountId || !txCreditAccountId) {
      const errMsg = "Description, value, debit account, and credit account are required.";
      toast.error(errMsg);
      setError(errMsg);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("description", txDescription.trim());
      formData.append("amount", txValue);
      formData.append("debit_account_id", txDebitAccountId);
      formData.append("credit_account_id", txCreditAccountId);
      if (txSupportingDocument) {
        formData.append("transaction_file", txSupportingDocument);
      }

      const res = await fetch("/api/transactions", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const payload = (await res.json()) as { detail?: string };
        throw new Error(payload.detail || "Failed to post transaction");
      }

      toast.success("Transaction posted.");
      setSuccess("Transaction posted.");
      setTxDescription("");
      setTxValue("");
      setTxDebitAccountId("");
      setTxCreditAccountId("");
      setTxSupportingDocument(null);
      await loadData();
    } catch (postError) {
      const errMsg = postError instanceof Error ? postError.message : "Failed to post transaction";
      toast.error(errMsg);
      setError(errMsg);
    }
  };

  const decideClientPayment = async (
    paymentId: string,
    status: "approved" | "rejected"
  ) => {
    clearStatus();

    try {
      const res = await fetch(`/api/client-payments/${paymentId}/decision`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const payload = (await res.json()) as { detail?: string };
        throw new Error(payload.detail || "Failed to decide client payment");
      }

      setSuccess(
        status === "approved"
          ? `Client payment #${paymentId} approved and posted to accounts.`
          : `Client payment #${paymentId} rejected.`
      );
      await loadData();
    } catch (decisionError) {
      setError(
        decisionError instanceof Error ? decisionError.message : "Failed to decide client payment"
      );
    }
  };

  const isAdmin = dashboardTitle === "Admin Dashboard";

  const { totalBankBalance, hasOutdatedBankStatements, hasExpiredFDs, totalFDAmount } = useMemo(() => {
    const paymentAccounts = data.accounts.filter(a => a.isPaymentAccepting && !a.isClosed);
    let outdated = false;

    const now = new Date();
    const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    for (const acc of paymentAccounts) {
      const statementsForAcc = data.bankStatements.filter(s => s.accountId === acc.id);
      const hasCurrent = statementsForAcc.some(s => s.month === currentYm);
      if (!hasCurrent) {
        outdated = true;
        break;
      }
    }

    const balance = data.accounts
      .filter(a => a.type === "asset" && !a.isClosed)
      .reduce((sum, a) => sum + accountBalance(a), 0);

    let expiredFD = false;
    let fdTotal = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const fd of data.fixedDeposits || []) {
      if (fd.status === "ACTIVE") {
        fdTotal += Number(fd.amount);

        const startDate = new Date(fd.startingDate);
        const endDate = new Date(startDate.getTime());
        
        if (fd.periodType === "months") {
          endDate.setMonth(endDate.getMonth() + fd.periodValue);
        } else if (fd.periodType === "days") {
          endDate.setDate(endDate.getDate() + fd.periodValue);
        }
        endDate.setHours(0, 0, 0, 0);

        if (today > endDate) {
          expiredFD = true;
        }
      }
    }

    return { 
      totalBankBalance: balance, 
      hasOutdatedBankStatements: outdated,
      hasExpiredFDs: expiredFD,
      totalFDAmount: fdTotal
    };
  }, [data.accounts, data.bankStatements, data.fixedDeposits, accountBalance]);

  const mappedPendingExpenses = pendingExpenses.map(e => {
    const user = data.users.find(u => u.id === e.employeeId);
    return {
      id: e.id,
      date: e.expenseDate,
      user: user?.full_name || user?.email || e.employeeId,
      description: e.description,
      amount: e.amount
    };
  });

  const mappedPendingPayments = pendingPayments.map(p => ({
    id: p.id,
    date: p.payment_date,
    client: p.client_name || p.client_id,
    project: p.project_name || p.project_id,
    amount: p.amount
  }));

  const isHealthStable = data.health.double_entry_balanced && data.health.accounting_equation_balanced;

  const expensesTableNode = (
    <PendingExpensesTable expenses={pendingExpenseGroups} readOnly={isReadOnly} onUpdated={loadData} />
  );

  const paymentsTableNode = (
    <>
      {pendingPayments.length === 0 ? (
        <p className={styles.emptyState}>No pending or PM-approved client payments</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Project</th>
                <th>Client</th>
                <th className={styles.numericCell}>Amount</th>
                <th>Document</th>
                <th>PM Notes</th>
                <th>Status</th>
                {!isReadOnly && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pendingPayments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.id}</td>
                  <td>{new Date(payment.payment_date).toLocaleDateString()}</td>
                  <td>{payment.project_name}</td>
                  <td>{payment.client_name || `Client #${payment.client_id}`}</td>
                  <td className={styles.numericCell}>{formatCurrency(payment.amount)}</td>
                  <td>
                    {payment.document_link ? (
                      payment.document_link.startsWith("/") ? (
                        <Link href={payment.document_link} className={styles.accountLink}>
                          View
                        </Link>
                      ) : (
                        <a
                          href={payment.document_link}
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
                  <td>{payment.pm_approval_notes || "-"}</td>
                  <td>{String(payment.status).toLowerCase().replace(/_/g, ' ')}</td>
                  {!isReadOnly && (
                    <td>
                      <div className={styles.pendingActions}>
                        <button
                          type="button"
                          className={`${styles.actionButtonSm} ${styles.approveButton}`}
                          onClick={() => decideClientPayment(payment.id, "approved")}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className={`${styles.actionButtonSm} ${styles.declineButton}`}
                          onClick={() => decideClientPayment(payment.id, "rejected")}
                        >
                          Decline
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  const showOverview = viewMode === "all" || viewMode === "overview";
  const showAccountingMgmt = viewMode === "all" || viewMode === "detailed";
  const showHealth = viewMode === "all" || viewMode === "detailed";
  const showPending = viewMode === "all" || viewMode === "detailed";
  const showCashFlow = viewMode === "all" || viewMode === "detailed";
  const showCustomAccounts = viewMode === "all" || viewMode === "detailed" || viewMode === "custom-accounts";
  const showEmployerAccounts = viewMode === "all" || viewMode === "detailed" || viewMode === "employees";
  const showProjectAccounts = viewMode === "all" || viewMode === "detailed" || viewMode === "projects";
  const showProjectManagers = viewMode === "all" || viewMode === "detailed" || viewMode === "projects";
  const showBank = viewMode === "all" || viewMode === "detailed" || viewMode === "bank";

  return (
    <div className={styles.page}>
      <header className={styles.headerCard}>
        <h1 className={styles.pageTitle}>{dashboardTitle}</h1>
        <p className={styles.pageSubtitle}>Welcome back, {displayName}</p>
      </header>

      {showOverview && (
        <>
        <DashboardOverview
          cashFlow={data.cashFlow.net_cash_flow}
          bankBalance={totalBankBalance}
          pendingExpenses={mappedPendingExpenses}
          pendingPayments={mappedPendingPayments}
          isHealthStable={isHealthStable}
          hasOutdatedBankStatements={hasOutdatedBankStatements}
          hasExpiredFDs={hasExpiredFDs}
            uncheckedTransactionsCount={data.health.unchecked_transactions}
            uncheckedAccountsBreakdown={data.health.unchecked_accounts_breakdown}
            accounts={data.accounts.map(a => ({ id: a.id, name: a.name }))}
          totalFDAmount={totalFDAmount}
          totalProjectReceivables={projectAccounts.reduce((sum, p) => sum + p.accountBalance, 0)}
          totalEmployeePayable={employerAccounts.reduce((sum, e) => sum + e.balance, 0)}
          expensesTableNode={expensesTableNode}
          paymentsTableNode={paymentsTableNode}
          bankStatementsNode={<BankStatementsDashboard accounts={data.accounts} onUploaded={loadData} />}
          onOpenCreateUser={() => {
            setShowCreateUser(true);
            setShowCreateProject(false);
            setShowCreateAccount(false);
          }}
          onOpenCreateAccount={() => {
            setShowCreateAccount(true);
            setShowCreateUser(false);
            setShowCreateUser(false);
            setShowCreateUser(false);
            setShowCreateProject(false);
          }}
          onOpenCreateProject={() => {
            setShowCreateProject(true);
            setShowCreateAccount(false);
            setShowCreateUser(false);
          }}
        />
        </>
      )}

      {(error || success) && (
        <section className={styles.card}>
          {error && <p className={styles.errorText}>{error}</p>}
          {success && <p className={styles.successText}>{success}</p>}
        </section>
      )}

      {showAccountingMgmt && (
        <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Accounting Management</h2>
        <div className={styles.buttonGrid}>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => {
              setShowCreateUser(true);
              setShowCreateProject(false);
              setShowCreateAccount(false);
            }}
          >
            Create User
          </button>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => {
              setShowCreateProject(true);
              setShowCreateUser(false);
              setShowCreateUser(false);
              setShowCreateUser(false);
              setShowCreateAccount(false);
            }}
          >
            Create Project
          </button>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => {
              setShowCreateAccount(true);
              setShowCreateUser(false);
              setShowCreateUser(false);
              setShowCreateUser(false);
              setShowCreateProject(false);
            }}
          >
            Create Custom Account
          </button>
          <button className={styles.primaryButton} type="button" onClick={() => setShowClosedAccounts(true)}>
            View Closed Accounts
          </button>
        </div>

      </section>
      )}

      {(showHealth || showBank) && (
      <section className={styles.twoColumnGrid}>
        {showHealth && (
        <article className={styles.card}>
          <h2 className={styles.sectionTitle}>Health Check</h2>
          <div className={styles.healthRows}>
            <div className={styles.healthRow}>
              <span>Double-entry check</span>
              <span className={data.health.double_entry_balanced ? styles.passPill : styles.failPill}>
                {data.health.double_entry_balanced ? "PASS" : "FAIL"}
              </span>
            </div>
            <div className={styles.healthRow}>
              <span>Accounting equation</span>
              <span
                className={
                  data.health.accounting_equation_balanced ? styles.passPill : styles.failPill
                }
              >
                {data.health.accounting_equation_balanced ? "PASS" : "FAIL"}
              </span>
            </div>
          </div>
        </article>
        )}

        {showBank && <BankStatementsDashboard accounts={data.accounts} onUploaded={loadData} />}
      </section>
      )}

      {showPending && (
      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Pending Expenses</h2>
        {expensesTableNode}
      </section>
      )}

      {showPending && (
      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Pending Client Payments</h2>
        {paymentsTableNode}
      </section>
      )}

      {showCashFlow && (
      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Cash Flow</h2>
        <div className={styles.metricGrid}>
          <div className={styles.metricCard}>
            <p className={styles.metricLabel}>Cash Inflow</p>
            <p className={styles.metricValue}>{formatCurrency(data.cashFlow.cash_inflow)}</p>
          </div>
          <div className={styles.metricCard}>
            <p className={styles.metricLabel}>Cash Outflow</p>
            <p className={styles.metricValue}>{formatCurrency(data.cashFlow.cash_outflow)}</p>
          </div>
          <div className={styles.metricCard}>
            <p className={styles.metricLabel}>Net Cash Flow</p>
            <p className={styles.metricValue}>{formatCurrency(data.cashFlow.net_cash_flow)}</p>
          </div>
        </div>

        {cashFlowTransactions.length === 0 ? (
          <p className={styles.emptyState}>No transactions</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Inflow</th>
                  <th>Outflow</th>
                </tr>
              </thead>
              <tbody>
                {cashFlowTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>{new Date(tx.date).toLocaleDateString()}</td>
                    <td>{tx.description}</td>
                    <td>{tx.inflow > 0 ? formatCurrency(tx.inflow) : "-"}</td>
                    <td>{tx.outflow > 0 ? formatCurrency(tx.outflow) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {showCustomAccounts && (
      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Custom Accounts Table</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Cash Flow</th>
                <th>Payment Accepting</th>
                <th>Petty Cash</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {customAccounts.map((account) => (
                <tr key={account.id}>
                  <td>
                    <Link className={styles.accountLink} href={`/account/${account.id}`}>
                      {account.code}
                    </Link>
                  </td>
                  <td>
                    <Link className={styles.accountLink} href={`/account/${account.id}`}>
                      {account.name}
                    </Link>
                  </td>
                  <td>{account.type}</td>
                  <td>{account.includeCashFlow ? "Yes" : "No"}</td>
                  <td>{account.isPaymentAccepting ? "Yes" : "No"}</td>
                  <td>{account.isPettyCash ? "Yes" : "No"}</td>
                  <td>{formatCurrency(accountBalance(account))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {showEmployerAccounts && (
      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Employer Accounts Table</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Account</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {employerAccounts.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.full_name}</td>
                  <td>{row.email}</td>
                  <td>{row.role}</td>
                  <td>
                    {row.accountId ? (
                      <Link className={styles.accountLink} href={`/account/${row.accountId}`}>
                        {row.accountCode}
                      </Link>
                    ) : (
                      row.accountCode
                    )}
                  </td>
                  <td>{formatCurrency(row.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {showProjectAccounts && (
      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Project Accounts Table</h2>
          <div style={{ marginBottom: "1rem" }}>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => setShowPendingProjects(true)}
            >
              Pending Projects ({pendingProjects.length})
            </button>
          </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Budget</th>
                <th>Account Name</th>
                <th>Account ID</th>
                <th>Balance</th>
                <th>Finance Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {projectAccounts.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{formatCurrency(Number(row.budget || 0))}</td>
                  <td>
                    <Link className={styles.accountLink} href={`/account/${row.account_id}`}>
                      {row.accountName}
                    </Link>
                  </td>
                  <td>
                    <Link className={styles.accountLink} href={`/account/${row.account_id}`}>
                      {row.account_id}
                    </Link>
                  </td>
                  <td>{formatCurrency(row.accountBalance)}</td>
                  <td>
                    {(() => {
                      const status = row.calculatedFinanceStatus;
                      let bg = "#fee2e2"; // Red background
                      let fg = "#991b1b"; // Red text
                      if (status === "Ready to Deliver") {
                        bg = "#dcfce7"; // Green background
                        fg = "#166534"; // Green text
                      } else if (status === "Outdated") {
                        bg = "#fef9c3"; // Yellow background
                        fg = "#854d0e"; // Yellow text
                      }
                      return (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            textAlign: "center",
                            padding: "0.2rem 0.55rem",
                            borderRadius: "999px",
                            backgroundColor: bg,
                            color: fg,
                            fontSize: "0.76rem",
                            fontWeight: 700,
                          }}
                        >
                          {status}
                        </span>
                      );
                    })()}
                  </td>
                  <td>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      onClick={() => beginEditProject(row)}
                    >
                      Edit Project
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {showProjectManagers && (
      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Project Managers Table</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Username</th>
                <th>Petty Cash Account</th>
                <th>Assigned Projects</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.pms.map((pm) => (
                <tr key={pm.id}>
                  <td>{pm.full_name}</td>
                  <td>{pm.email}</td>
                  <td>{pm.username || "-"}</td>
                  <td>{pm.petty_cash_account_id || "-"}</td>
                  <td>
                    {pm.managed_project_ids
                      .map((projectId) => projectMap.get(projectId)?.name || `Project ${projectId}`)
                      .join(", ") || "-"}
                  </td>
                  <td>
                    <button className={styles.secondaryButton} type="button" onClick={() => beginEditPm(pm)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {editingPmId !== null && (
          <div className={styles.inlineCard}>
            <h3 className={styles.subTitle}>Edit Project Manager</h3>
            <div className={styles.inlineGrid}>
              <select
                className={styles.input}
                value={editPmPettyCash}
                onChange={(e) => setEditPmPettyCash(e.target.value)}
              >
                <option value="">No petty cash account</option>
                {pettyCashAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.selectionBox}>
              {data.projects.map((project) => (
                <label key={project.id} className={styles.selectionItem}>
                  <input
                    type="checkbox"
                    checked={editPmProjects.includes(project.id)}
                    onChange={() => toggleProjectSelection(project.id)}
                  />
                  {project.name}
                </label>
              ))}
            </div>
            <div className={styles.actionsRow}>
              <button className={styles.secondaryButton} type="button" onClick={() => setEditingPmId(null)}>
                Cancel
              </button>
              <button className={styles.primaryButton} type="button" onClick={savePmEdit}>
                Save
              </button>
            </div>
          </div>
        )}
      </section>
      )}

      {showCreateUser && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalPanel}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Create User</h3>
              <button className={styles.secondaryButton} type="button" onClick={() => setShowCreateUser(false)}>
                Close
              </button>
            </div>

            <form onSubmit={handleCreateUser} className={styles.modalBody}>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontWeight: 600 }}>Role</label>
                  <select
                    className={styles.input}
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value as any, selectedProjects: [] })}
                  >
                    <option value="employee">Employee</option>
                    <option value="project_manager">Project Manager</option>
                    <option value="client">Client</option>
                    <option value="admin">Admin</option>
                    <option value="financial_officer">Financial Officer</option>
                  </select>
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontWeight: 600 }}>Full Name</label>
                  <input
                    className={styles.input}
                    placeholder="Name"
                    value={userForm.fullName}
                    onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
                    required
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontWeight: 600 }}>Email</label>
                  <input
                    className={styles.input}
                    type="email"
                    placeholder="Email"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    required
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontWeight: 600 }}>Password</label>
                  <input
                    className={styles.input}
                    type="password"
                    placeholder="Password"
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    required
                  />
                </div>

                {userForm.role === "project_manager" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontWeight: 600 }}>Petty Cash Account</label>
                    <select
                      className={styles.input}
                      value={userForm.pettyCashAccountId}
                      onChange={(e) => setUserForm({ ...userForm, pettyCashAccountId: e.target.value })}
                      required
                    >
                      <option value="">Select Petty Cash Account</option>
                      {pettyCashAccounts.map(a => (
                        <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
                      ))}
                    </select>
                  </div>
                )}

                {(userForm.role === "project_manager" || userForm.role === "client" || userForm.role === "employee") && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <label style={{ fontWeight: 600 }}>Assign Projects</label>
                    
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {userForm.selectedProjects.map((projId) => {
                        const pInfo = data.projects.find(p => p.id === projId);
                        return pInfo ? (
                          <div
                            key={projId}
                            style={{
                              backgroundColor: "#e0e7ff",
                              color: "#000",
                              padding: "4px 8px",
                              borderRadius: "16px",
                              fontSize: "0.85rem",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              cursor: "pointer"
                            }}
                            onClick={() => setUserForm(prev => ({
                              ...prev,
                              selectedProjects: prev.selectedProjects.filter(id => id !== projId)
                            }))}
                            title="Click to remove"
                          >
                            {pInfo.code} - {pInfo.name} &times;
                          </div>
                        ) : null;
                      })}
                    </div>
                    
                    <input
                      className={styles.input}
                      placeholder="Search to add a project..."
                      value={projectSearchFilter}
                      onFocus={() => setShowProjectDropdown(true)}
                      onBlur={() => setTimeout(() => setShowProjectDropdown(false), 200)}
                      onChange={(e) => {
                        setProjectSearchFilter(e.target.value);
                        setShowProjectDropdown(true);
                      }}
                    />
                    
                    {showProjectDropdown && (
                      <div style={{ maxHeight: "150px", overflowY: "auto", border: "1px solid #ccc", borderRadius: "4px" }}>
                        {data.projects
                           .filter(p => !userForm.selectedProjects.includes(p.id))
                           .filter(p => (p.name + p.code).toLowerCase().includes(projectSearchFilter.toLowerCase()))
                           .map(p => (
                             <div 
                               key={p.id}
                               style={{ padding: "8px", cursor: "pointer", borderBottom: "1px solid #f0f0f0", transition: "background-color 0.2s" }}
                               onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f9f9f9")}
                               onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                               onClick={() => {
                                 setUserForm(prev => ({ ...prev, selectedProjects: [...prev.selectedProjects, p.id] }));
                                 setProjectSearchFilter("");
                               }}
                             >
                               {p.code} - {p.name}
                             </div>
                           ))
                        }
                        
                        {data.projects
                           .filter(p => !userForm.selectedProjects.includes(p.id))
                           .filter(p => (p.name + p.code).toLowerCase().includes(projectSearchFilter.toLowerCase()))
                           .length === 0 && (
                             <div style={{ padding: "8px", color: "#666" }}>No unused projects match your search.</div>
                           )
                        }
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div style={{ marginTop: "16px" }} className={styles.actionsRowSimple}>
                <button className={styles.primaryButton} type="submit">Create User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCreateProject && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalPanelWide}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Create Project</h3>
              <button className={styles.secondaryButton} type="button" onClick={() => setShowCreateProject(false)}>
                Close
              </button>
            </div>
            <form className={styles.modalBody} onSubmit={createProject}>
              <div className={styles.inlineGrid}>
                <input
                  className={styles.input}
                  placeholder="Project Name"
                  value={projectForm.name}
                  onChange={(e) => setProjectForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Budget"
                  value={projectForm.budget}
                  onChange={(e) => setProjectForm((prev) => ({ ...prev, budget: e.target.value }))}
                />
                <input
                  className={styles.input}
                  placeholder="Description"
                  value={projectForm.description}
                  onChange={(e) => setProjectForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <SearchableMultiSelect
                title="Assign Employees"
                options={employeeUserOptions}
                selectedIds={createProjectEmployeeIds}
                onToggle={toggleCreateProjectEmployee}
                placeholder="Type employee name to filter"
                emptyText="No matching employees"
              />

              <SearchableMultiSelect
                title="Assign Clients"
                options={clientUserOptions}
                selectedIds={createProjectClientIds}
                onToggle={toggleCreateProjectClient}
                placeholder="Type client name to filter"
                emptyText="No matching clients"
              />
              <div className={styles.actionsRowSimple}>
                <button className={styles.primaryButton} type="submit">Create Project</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCreateAccount && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalPanelWide}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Create Custom Account</h3>
              <button className={styles.secondaryButton} type="button" onClick={() => setShowCreateAccount(false)}>
                Close
              </button>
            </div>
            <form className={styles.modalBody} onSubmit={createCustomAccount}>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%", maxWidth: "400px", margin: "0 auto" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "0.875rem", fontWeight: "500", color: "#374151" }}>Account Code</label>
                  <input
                    className={styles.input}
                    placeholder="e.g. 1000"
                    value={accountForm.code}
                    onChange={(e) => setAccountForm((prev) => ({ ...prev, code: e.target.value }))}
                    required
                  />
                </div>
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
              </div>
              <div className={styles.checkboxRow}>
                <label>
                  <input
                    type="checkbox"
                    checked={accountForm.includeCashFlow}
                    onChange={(e) =>
                      setAccountForm((prev) => ({ ...prev, includeCashFlow: e.target.checked }))
                    }
                  />{" "}
                  Include in cash flow
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={accountForm.isPaymentAccepting}
                    onChange={(e) =>
                      setAccountForm((prev) => ({ ...prev, isPaymentAccepting: e.target.checked }))
                    }
                  />{" "}
                  Payment accepting
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={accountForm.isPettyCash}
                    onChange={(e) =>
                      setAccountForm((prev) => ({ ...prev, isPettyCash: e.target.checked }))
                    }
                  />{" "}
                  Petty cash
                </label>
              </div>

              {accountForm.isPaymentAccepting && (
                <div className={styles.formRowGroup}>
                  <input
                    className={styles.input}
                    placeholder="Account Holder Name"
                    value={accountForm.accountHolderName}
                    onChange={(e) => setAccountForm((prev) => ({ ...prev, accountHolderName: e.target.value }))}
                  />
                  <input
                    className={styles.input}
                    placeholder="Bank Name"
                    value={accountForm.bankName}
                    onChange={(e) => setAccountForm((prev) => ({ ...prev, bankName: e.target.value }))}
                  />
                  <input
                    className={styles.input}
                    placeholder="Account Number"
                    value={accountForm.accountNumber}
                    onChange={(e) => setAccountForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
                  />
                  <input
                    className={styles.input}
                    placeholder="Branch"
                    value={accountForm.bankBranch}
                    onChange={(e) => setAccountForm((prev) => ({ ...prev, bankBranch: e.target.value }))}
                  />
                </div>
              )}

              <div className={styles.actionsRowSimple}>
                <button className={styles.primaryButton} type="submit">Create Custom Account</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showClosedAccounts && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalPanelWide}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Closed Accounts</h3>
              <button className={styles.secondaryButton} type="button" onClick={() => setShowClosedAccounts(false)}>
                Close
              </button>
            </div>
            <div className={styles.modalBody}>
              {closedAccounts.length === 0 ? (
                <p className={styles.emptyState}>No closed accounts.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Name</th>
                        <th>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {closedAccounts.map((account) => (
                        <tr key={account.id}>
                          <td>{account.code}</td>
                          <td>{account.name}</td>
                          <td>{account.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editingProjectId !== null && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalPanelWide}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Edit Project</h3>
              <button className={styles.secondaryButton} type="button" onClick={() => setEditingProjectId(null)}>
                Close
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.inlineGrid}>
                <input
                  className={styles.input}
                  placeholder="Project Name"
                  value={editProjectForm.name}
                  onChange={(e) => setEditProjectForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Budget"
                  value={editProjectForm.budget}
                  onChange={(e) => setEditProjectForm((prev) => ({ ...prev, budget: e.target.value }))}
                />
                <input
                  className={styles.input}
                  placeholder="Description"
                  value={editProjectForm.description}
                  onChange={(e) => setEditProjectForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <SearchableMultiSelect
                title="Assigned Employees"
                options={employeeUserOptions}
                selectedIds={editProjectForm.employeeIds}
                onToggle={toggleEditProjectEmployee}
                placeholder="Type employee name to filter"
                emptyText="No matching employees"
              />

              <SearchableMultiSelect
                title="Assigned Clients"
                options={clientUserOptions}
                selectedIds={editProjectForm.clientIds}
                onToggle={toggleEditProjectClient}
                placeholder="Type client name to filter"
                emptyText="No matching clients"
              />

              <div className={styles.actionsRowSimple}>
                <button className={styles.secondaryButton} type="button" onClick={() => setEditingProjectId(null)}>
                  Cancel
                </button>
                <button className={styles.primaryButton} type="button" onClick={saveProjectEdit}>
                  Save Project
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPendingProjects && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalPanelWide}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Pending Projects (Missing Account)</h3>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => setShowPendingProjects(false)}
              >
                Close
              </button>
            </div>
            <div className={styles.modalBody}>
              {pendingProjects.length === 0 ? (
                <p className={styles.emptyState}>No pending projects.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Budget</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingProjects.map((project) => (
                        <tr key={project.id}>
                          <td>{project.code}</td>
                          <td>{project.name}</td>
                          <td>{project.status || "-"}</td>
                          <td>{formatCurrency(Number(project.budget || 0))}</td>
                          <td>
                            <button
                              className={styles.primaryButton}
                              type="button"
                              onClick={() => createAccountForProject(project.id)}
                              disabled={isAdmin}
                              style={isAdmin ? { backgroundColor: "#d1d5db", color: "#6b7280", cursor: "not-allowed" } : undefined}
                              title={isAdmin ? "Admins cannot create project accounts from here" : undefined}
                            >
                              Create Account
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <LoadingSpinner fullScreen />
      )}

      {showBank && (
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Bank Accounts</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Account Type</th>
                  <th>Category</th>
                  <th>Bank Name</th>
                  <th>Account Number</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {customAccounts.filter(a => a.isPaymentAccepting || a.isPettyCash).map((account) => (
                  <tr key={account.id}>
                    <td>
                      <Link className={styles.accountLink} href={`/account/${account.id}`}>
                        {account.code}
                      </Link>
                    </td>
                    <td>
                      <Link className={styles.accountLink} href={`/account/${account.id}`}>
                        {account.name}
                      </Link>
                    </td>
                    <td>{account.type}</td>
                    <td>
                      {account.isPettyCash ? "Petty Cash" : "Payment Accepting"}
                    </td>
                    <td>{account.bankName || "-"}</td>
                    <td>{account.accountNumber || "-"}</td>
                    <td>{formatCurrency(accountBalance(account))}</td>
                  </tr>
                ))}
                {customAccounts.filter(a => a.isPaymentAccepting || a.isPettyCash).length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "1rem" }}>
                      No bank or petty cash accounts found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {bottomContent && bottomContent}

      {(!isAdmin && showOverview) && (
        <section className={styles.card} style={{ marginTop: "24px" }}>
          <h2 className={styles.sectionTitle}>Add Transaction / Journal Entry</h2>
          <form
            onSubmit={postTransaction}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <input
              className={styles.input}
              placeholder="Description"
              value={txDescription}
              onChange={(e) => setTxDescription(e.target.value)}
              required
            />
            <input
              className={styles.input}
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount"
              value={txValue}
              onChange={(e) => setTxValue(e.target.value)}
              required
            />
            <select
              className={styles.input}
              value={txDebitAccountId}
              onChange={(e) => setTxDebitAccountId(e.target.value)}
              required
            >
              <option value="">Select Debit Account</option>
              {data.accounts.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
            <select
              className={styles.input}
              value={txCreditAccountId}
              onChange={(e) => setTxCreditAccountId(e.target.value)}
              required
            >
              <option value="">Select Credit Account</option>
              {data.accounts.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
            <input
              className={styles.input}
              title="Supporting Document (Optional)"
              type="file"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  setTxSupportingDocument(e.target.files[0]);
                } else {
                  setTxSupportingDocument(null);
                }
              }}
            />
            <div className={styles.actionsRowSimple} style={{ alignSelf: "flex-end" }}>
              <button type="button" className={styles.secondaryButton} onClick={clearTransactionForm}>
                Clear
              </button>
              <button type="submit" className={styles.primaryButton}>
                Post Transaction
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}



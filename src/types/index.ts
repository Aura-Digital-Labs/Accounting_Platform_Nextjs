// ─── Re-exported Prisma enums for client-side use ────────────────

export const UserRole = {
  ADMIN: "admin",
  FINANCIAL_OFFICER: "financial_officer",
  EMPLOYEE: "employee",
  CLIENT: "client",
  PROJECT_MANAGER: "project_manager",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const AccountType = {
  ASSET: "asset",
  LIABILITY: "liability",
  EQUITY: "equity",
  REVENUE: "revenue",
  EXPENSE: "expense",
} as const;

export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const EntryType = {
  DEBIT: "debit",
  CREDIT: "credit",
} as const;

export type EntryType = (typeof EntryType)[keyof typeof EntryType];

export const ExpenseStatus = {
  PENDING: "pending",
  APPROVED_BY_PM: "approved_by_pm",
  REJECTED_BY_PM: "rejected_by_pm",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export type ExpenseStatus = (typeof ExpenseStatus)[keyof typeof ExpenseStatus];

export const ClientPaymentStatus = {
  PENDING: "pending",
  APPROVED_BY_PM: "approved_by_pm",
  REJECTED_BY_PM: "rejected_by_pm",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export type ClientPaymentStatus =
  (typeof ClientPaymentStatus)[keyof typeof ClientPaymentStatus];

// ─── API Payload Types ───────────────────────────────────────────

export interface AccountCreate {
  code: string;
  name: string;
  type: AccountType;
  description?: string | null;
  budget?: number | null;
  includeCashFlow?: boolean;
  isPaymentAccepting?: boolean;
  isPettyCash?: boolean;
  accountNumber?: string | null;
  accountHolderName?: string | null;
  bankBranch?: string | null;
}

export interface AccountUpdate {
  code?: string | null;
  name?: string | null;
  type?: AccountType | null;
  description?: string | null;
  budget?: number | null;
  includeCashFlow?: boolean | null;
  isPaymentAccepting?: boolean | null;
  isPettyCash?: boolean | null;
  accountNumber?: string | null;
  accountHolderName?: string | null;
  bankBranch?: string | null;
}

export interface AccountRead {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  description: string | null;
  projectId: number | null;
  budget: number | null;
  includeCashFlow: boolean;
  isPaymentAccepting: boolean;
  isPettyCash: boolean;
  isClosed: boolean;
  closedAt: string | null;
  accountNumber: string | null;
  accountHolderName: string | null;
  bankBranch: string | null;
}

export interface TransactionEntryCreate {
  accountId: number;
  entryType: EntryType;
  amount: number;
}

export interface TransactionCreate {
  reference?: string | null;
  description: string;
  sourceType?: string | null;
  sourceId?: number | null;
  entries: TransactionEntryCreate[];
  documentLink?: string | null;
}

export interface TransactionUpdate {
  reference?: string | null;
  description: string;
  entries: TransactionEntryCreate[];
  documentLink?: string | null;
}

export interface TransactionEntryRead {
  id: number;
  accountId: number;
  entryType: EntryType;
  amount: number;
  isChecked: boolean;
}

export interface TransactionRead {
  id: number;
  reference: string | null;
  description: string;
  sourceType: string | null;
  sourceId: number | null;
  documentLink: string | null;
  entries: TransactionEntryRead[];
}

export interface UserCreate {
  email: string;
  username?: string | null;
  name: string;
  password: string;
  role?: UserRole;
}

export interface UserRead {
  id: number;
  email: string;
  username: string | null;
  name: string;
  role: UserRole;
  isActive: boolean;
  pettyCashAccountId: number | null;
}

export interface ProjectCreate {
  code: string;
  name: string;
  description?: string | null;
  budget?: number;
}

export interface ProjectRead {
  id: number;
  code: string;
  name: string;
  description: string | null;
  budget: number;
  accountId: number;
  clientId: number | null;
  clientUsername: string | null;
  clientPassword: string | null;
}

export interface ExpenseRead {
  id: number;
  projectId: number;
  employeeId: number;
  projectName?: string | null;
  employeeName?: string | null;
  description: string;
  amount: number;
  expenseDate: string;
  receiptPath: string | null;
  paymentSource: string;
  status: ExpenseStatus;
  createdTransactionId: number | null;
  approvedByPmId: number | null;
  finalExpenseAmount: number | null;
  pmApprovalDate: string | null;
  pmApprovalNotes: string | null;
}

export interface ClientPaymentRead {
  id: number;
  projectId: number;
  clientId: number;
  projectName?: string | null;
  clientName?: string | null;
  paymentAccountId: number;
  amount: number;
  paymentDate: string;
  description: string | null;
  documentLink: string | null;
  status: ClientPaymentStatus;
  createdTransactionId: number | null;
  approvedByPmId: number | null;
  pmApprovalDate: string | null;
  pmApprovalNotes: string | null;
}

export interface BankStatementRead {
  id: number;
  accountId: number;
  month: string;
  statementLink: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectManagerRead {
  id: number;
  email: string;
  username: string | null;
  name: string;
  role: UserRole;
  isActive: boolean;
  pettyCashAccountId: number | null;
  managedProjectIds: number[];
}

-- Full local schema bootstrap based on new structure.json
-- Safe for a brand new local database. This recreates public schema.

BEGIN;

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- ------------------------------------------------------------------
-- Core user and project domain
-- ------------------------------------------------------------------
CREATE TABLE "User" (
  id text PRIMARY KEY,
  email text,
  username text,
  password text,
  name text,
  role text,
  "employmentType" text,
  "monthlySalary" double precision,
  "bankAccountName" text,
  "bankAccountNumber" text,
  "bankName" text,
  "bankBranch" text,
  "bankNotes" text,
  level integer,
  "lastSeen" timestamp,
  post text,
  petty_cash_account_id integer,
  is_active boolean,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "Project" (
  id text PRIMARY KEY,
  code varchar(32),
  name text,
  description text,
  budget double precision,
  status text,
  "financialStatus" text,
  "createdById" text,
  "projectManagerId" text,
  "progressDiscussion" boolean,
  "progressEstimation" boolean,
  "progressEmployeeAllocation" boolean,
  "progressDevelopment" boolean,
  "progressTesting" boolean,
  "progressDeployment" boolean,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  account_id integer,
  client_id text,
  client_password varchar(255)
);

CREATE TABLE "ProjectAssignment" (
  id text PRIMARY KEY,
  "projectId" text,
  "userId" text,
  "createdAt" timestamp
);

CREATE TABLE project_manager_assignments (
  id integer PRIMARY KEY,
  project_id text,
  manager_id text
);

CREATE TABLE expenses (
  id text PRIMARY KEY,
  project_id text,
  employee_id text,
  description text,
  amount numeric(14,2),
  expense_date date,
  receipt_path varchar(500),
  payment_source varchar(32),
  status text,
  created_transaction_id integer,
  approved_by_pm_id text,
  final_expense_amount numeric(14,2),
  pm_approval_date timestamp,
  pm_approval_notes text
);

CREATE TABLE "ClientPayment" (
  id text PRIMARY KEY,
  "projectId" text,
  "clientId" text,
  payment_account_id integer,
  description text,
  document_link varchar(500),
  title text,
  amount double precision,
  status text,
  created_transaction_id integer,
  confirmed boolean,
  "confirmedAt" timestamp,
  "confirmedBy" text,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  pm_approval_notes text
);

-- ------------------------------------------------------------------
-- Payments, wages, agreements, templates
-- ------------------------------------------------------------------
CREATE TABLE "AdminPayment" (
  id text PRIMARY KEY,
  "projectId" text,
  "recordedBy" text,
  title text,
  amount double precision,
  description text,
  "paymentDate" timestamp,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "ExternalPayment" (
  id text PRIMARY KEY,
  "payerName" text,
  title text,
  amount double precision,
  description text,
  status text,
  "paymentDate" timestamp,
  "paidDate" timestamp,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "GeneralPayment" (
  id text PRIMARY KEY,
  "recordedBy" text,
  title text,
  amount double precision,
  description text,
  category text,
  "paymentDate" timestamp,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "MonthlySalary" (
  id text PRIMARY KEY,
  "employeeId" text,
  month text,
  amount double precision,
  "paymentStatus" text,
  "paidDate" timestamp,
  notes text,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "ProjectWage" (
  id text PRIMARY KEY,
  "projectId" text,
  "employeeId" text,
  amount double precision,
  description text,
  "paymentStatus" text,
  "paidDate" timestamp,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "WagePayment" (
  id text PRIMARY KEY,
  "projectWageId" text,
  "monthlySalaryId" text,
  amount double precision,
  "paidDate" timestamp,
  notes text,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "Template" (
  id text PRIMARY KEY,
  name text,
  type text,
  content jsonb,
  "isPremade" boolean,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "Agreement" (
  id text PRIMARY KEY,
  "projectId" text,
  "templateId" text,
  title text,
  content jsonb,
  status text,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  "completedAt" timestamp
);

CREATE TABLE "Signature" (
  id text PRIMARY KEY,
  "agreementId" text,
  "userId" text,
  "signerName" text,
  confirmed boolean,
  "confirmText" text,
  "signedAt" timestamp,
  "createdAt" timestamp
);

CREATE TABLE "Estimate" (
  id text PRIMARY KEY,
  name text,
  "costPerHour" double precision,
  tasks jsonb,
  "totalAmount" double precision,
  "totalHours" double precision,
  "projectId" text,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  "createdById" text
);

-- ------------------------------------------------------------------
-- KPI and monitoring domain
-- ------------------------------------------------------------------
CREATE TABLE "MonitoredUser" (
  id text PRIMARY KEY,
  "userId" text,
  "addedBy" text,
  "isActive" boolean,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "KPIIndicator" (
  id text PRIMARY KEY,
  "monitoredUserId" text,
  name text,
  description text,
  unit text,
  "targetValue" double precision,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "KPIEvaluation" (
  id text PRIMARY KEY,
  "monitoredUserId" text,
  "evaluatedBy" text,
  "weekStartDate" timestamp,
  "weekEndDate" timestamp,
  "overallNotes" text,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "KPIEvaluationItem" (
  id text PRIMARY KEY,
  "evaluationId" text,
  "kpiIndicatorId" text,
  value double precision,
  notes text,
  "createdAt" timestamp
);

CREATE TABLE "DismissedWeek" (
  id text PRIMARY KEY,
  "monitoredUserId" text,
  "weekStartDate" timestamp,
  "weekEndDate" timestamp,
  reason text,
  "dismissedBy" text,
  "createdAt" timestamp
);

CREATE TABLE "EmployeeReview" (
  id text PRIMARY KEY,
  "employeeId" text,
  "reviewerId" text,
  rating double precision,
  comment text,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  "monthlySalaryId" text,
  "projectWageId" text
);

CREATE TABLE "Notification" (
  id text PRIMARY KEY,
  "userId" text,
  type text,
  title text,
  message text,
  read boolean,
  link text,
  metadata jsonb,
  "createdAt" timestamp
);

-- ------------------------------------------------------------------
-- Banking and inventory domain
-- ------------------------------------------------------------------
CREATE TABLE "BankAccount" (
  id text PRIMARY KEY,
  "accountName" text,
  "accountNumber" text,
  "bankName" text,
  branch text,
  notes text,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  balance double precision,
  "maintainerName" text
);

CREATE TABLE "BankTransaction" (
  id text PRIMARY KEY,
  "bankAccountId" text,
  date timestamp,
  amount double precision,
  type text,
  description text,
  category text,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "ProjectBankAssignment" (
  id text PRIMARY KEY,
  "projectId" text,
  "bankAccountId" text,
  "createdAt" timestamp
);

CREATE TABLE "ProjectLink" (
  id text PRIMARY KEY,
  "projectId" text,
  title text,
  url text,
  "isEstimate" boolean,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "InventoryItem" (
  id text PRIMARY KEY,
  name text,
  description text,
  count integer,
  "pricePerItem" double precision,
  "totalPrice" double precision,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "Equipment" (
  id text PRIMARY KEY,
  "projectId" text,
  name text,
  description text,
  "costPerMonth" double precision,
  "handoverDate" timestamp,
  delivered boolean,
  "deliveredDate" timestamp,
  paid boolean,
  "paidDate" timestamp,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  "costPerWeek" double precision,
  "fixedPrice" double precision,
  "returnDate" timestamp,
  type text
);

-- ------------------------------------------------------------------
-- Existing accounting tables in new structure file
-- ------------------------------------------------------------------
CREATE TABLE transactions (
  id integer PRIMARY KEY,
  reference varchar(100),
  description text,
  created_by text,
  source_type varchar(32),
  source_id text,
  posted_at timestamp,
  document_link varchar(500)
);

CREATE TABLE transaction_entries (
  id integer PRIMARY KEY,
  transaction_id integer,
  account_id integer,
  entry_type text,
  amount numeric(14,2),
  is_checked boolean
);

CREATE TABLE "_prisma_migrations" (
  id varchar(36) PRIMARY KEY,
  checksum varchar(64),
  finished_at timestamp,
  migration_name varchar(255),
  logs text,
  rolled_back_at timestamp,
  started_at timestamp,
  applied_steps_count integer
);

-- ------------------------------------------------------------------
-- Foreign keys
-- ------------------------------------------------------------------
ALTER TABLE "Project"
  ADD CONSTRAINT fk_project_client FOREIGN KEY (client_id) REFERENCES "User"(id),
  ADD CONSTRAINT fk_project_created_by FOREIGN KEY ("createdById") REFERENCES "User"(id),
  ADD CONSTRAINT fk_project_manager FOREIGN KEY ("projectManagerId") REFERENCES "User"(id);

ALTER TABLE "ProjectAssignment"
  ADD CONSTRAINT fk_project_assignment_project FOREIGN KEY ("projectId") REFERENCES "Project"(id),
  ADD CONSTRAINT fk_project_assignment_user FOREIGN KEY ("userId") REFERENCES "User"(id);

ALTER TABLE project_manager_assignments
  ADD CONSTRAINT fk_pm_assignment_project FOREIGN KEY (project_id) REFERENCES "Project"(id),
  ADD CONSTRAINT fk_pm_assignment_manager FOREIGN KEY (manager_id) REFERENCES "User"(id);

ALTER TABLE expenses
  ADD CONSTRAINT fk_expense_project FOREIGN KEY (project_id) REFERENCES "Project"(id),
  ADD CONSTRAINT fk_expense_employee FOREIGN KEY (employee_id) REFERENCES "User"(id),
  ADD CONSTRAINT fk_expense_pm FOREIGN KEY (approved_by_pm_id) REFERENCES "User"(id);

ALTER TABLE "ClientPayment"
  ADD CONSTRAINT fk_client_payment_project FOREIGN KEY ("projectId") REFERENCES "Project"(id),
  ADD CONSTRAINT fk_client_payment_client FOREIGN KEY ("clientId") REFERENCES "User"(id),
  ADD CONSTRAINT fk_client_payment_confirmed_by FOREIGN KEY ("confirmedBy") REFERENCES "User"(id),
  ADD CONSTRAINT fk_client_payment_tx FOREIGN KEY (created_transaction_id) REFERENCES transactions(id);

ALTER TABLE "AdminPayment"
  ADD CONSTRAINT fk_admin_payment_project FOREIGN KEY ("projectId") REFERENCES "Project"(id),
  ADD CONSTRAINT fk_admin_payment_user FOREIGN KEY ("recordedBy") REFERENCES "User"(id);

ALTER TABLE "GeneralPayment"
  ADD CONSTRAINT fk_general_payment_user FOREIGN KEY ("recordedBy") REFERENCES "User"(id);

ALTER TABLE "Agreement"
  ADD CONSTRAINT fk_agreement_project FOREIGN KEY ("projectId") REFERENCES "Project"(id),
  ADD CONSTRAINT fk_agreement_template FOREIGN KEY ("templateId") REFERENCES "Template"(id);

ALTER TABLE "Signature"
  ADD CONSTRAINT fk_signature_agreement FOREIGN KEY ("agreementId") REFERENCES "Agreement"(id),
  ADD CONSTRAINT fk_signature_user FOREIGN KEY ("userId") REFERENCES "User"(id);

ALTER TABLE "Estimate"
  ADD CONSTRAINT fk_estimate_project FOREIGN KEY ("projectId") REFERENCES "Project"(id),
  ADD CONSTRAINT fk_estimate_creator FOREIGN KEY ("createdById") REFERENCES "User"(id);

ALTER TABLE "ProjectWage"
  ADD CONSTRAINT fk_project_wage_project FOREIGN KEY ("projectId") REFERENCES "Project"(id),
  ADD CONSTRAINT fk_project_wage_employee FOREIGN KEY ("employeeId") REFERENCES "User"(id);

ALTER TABLE "MonthlySalary"
  ADD CONSTRAINT fk_monthly_salary_employee FOREIGN KEY ("employeeId") REFERENCES "User"(id);

ALTER TABLE "WagePayment"
  ADD CONSTRAINT fk_wage_payment_project_wage FOREIGN KEY ("projectWageId") REFERENCES "ProjectWage"(id),
  ADD CONSTRAINT fk_wage_payment_monthly_salary FOREIGN KEY ("monthlySalaryId") REFERENCES "MonthlySalary"(id);

ALTER TABLE "EmployeeReview"
  ADD CONSTRAINT fk_employee_review_employee FOREIGN KEY ("employeeId") REFERENCES "User"(id),
  ADD CONSTRAINT fk_employee_review_reviewer FOREIGN KEY ("reviewerId") REFERENCES "User"(id),
  ADD CONSTRAINT fk_employee_review_monthly_salary FOREIGN KEY ("monthlySalaryId") REFERENCES "MonthlySalary"(id),
  ADD CONSTRAINT fk_employee_review_project_wage FOREIGN KEY ("projectWageId") REFERENCES "ProjectWage"(id);

ALTER TABLE "MonitoredUser"
  ADD CONSTRAINT fk_monitored_user_user FOREIGN KEY ("userId") REFERENCES "User"(id),
  ADD CONSTRAINT fk_monitored_user_added_by FOREIGN KEY ("addedBy") REFERENCES "User"(id);

ALTER TABLE "KPIIndicator"
  ADD CONSTRAINT fk_kpi_indicator_monitored_user FOREIGN KEY ("monitoredUserId") REFERENCES "MonitoredUser"(id);

ALTER TABLE "KPIEvaluation"
  ADD CONSTRAINT fk_kpi_eval_monitored_user FOREIGN KEY ("monitoredUserId") REFERENCES "MonitoredUser"(id),
  ADD CONSTRAINT fk_kpi_eval_user FOREIGN KEY ("evaluatedBy") REFERENCES "User"(id);

ALTER TABLE "KPIEvaluationItem"
  ADD CONSTRAINT fk_kpi_eval_item_eval FOREIGN KEY ("evaluationId") REFERENCES "KPIEvaluation"(id),
  ADD CONSTRAINT fk_kpi_eval_item_indicator FOREIGN KEY ("kpiIndicatorId") REFERENCES "KPIIndicator"(id);

ALTER TABLE "DismissedWeek"
  ADD CONSTRAINT fk_dismissed_week_monitored_user FOREIGN KEY ("monitoredUserId") REFERENCES "MonitoredUser"(id),
  ADD CONSTRAINT fk_dismissed_week_user FOREIGN KEY ("dismissedBy") REFERENCES "User"(id);

ALTER TABLE "Notification"
  ADD CONSTRAINT fk_notification_user FOREIGN KEY ("userId") REFERENCES "User"(id);

ALTER TABLE "BankTransaction"
  ADD CONSTRAINT fk_bank_tx_bank_account FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"(id);

ALTER TABLE "ProjectBankAssignment"
  ADD CONSTRAINT fk_project_bank_assignment_project FOREIGN KEY ("projectId") REFERENCES "Project"(id),
  ADD CONSTRAINT fk_project_bank_assignment_bank FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"(id);

ALTER TABLE "ProjectLink"
  ADD CONSTRAINT fk_project_link_project FOREIGN KEY ("projectId") REFERENCES "Project"(id);

ALTER TABLE "Equipment"
  ADD CONSTRAINT fk_equipment_project FOREIGN KEY ("projectId") REFERENCES "Project"(id);

ALTER TABLE transactions
  ADD CONSTRAINT fk_transactions_creator FOREIGN KEY (created_by) REFERENCES "User"(id);

ALTER TABLE transaction_entries
  ADD CONSTRAINT fk_transaction_entries_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id);

COMMIT;

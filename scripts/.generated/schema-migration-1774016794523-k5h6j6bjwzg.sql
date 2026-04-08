BEGIN;

DROP SCHEMA IF EXISTS public CASCADE;

CREATE SCHEMA public;

CREATE TABLE "AdminPayment" (
  "id" text PRIMARY KEY,
  "projectId" text,
  "recordedBy" text,
  "title" text,
  "amount" double precision,
  "description" text,
  "paymentDate" timestamp,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "Agreement" (
  "id" text PRIMARY KEY,
  "projectId" text,
  "templateId" text,
  "title" text,
  "content" jsonb,
  "status" text,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  "completedAt" timestamp
);

CREATE TABLE "BankAccount" (
  "id" text PRIMARY KEY,
  "accountName" text,
  "accountNumber" text,
  "bankName" text,
  "branch" text,
  "notes" text,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  "balance" double precision,
  "maintainerName" text
);

CREATE TABLE "BankTransaction" (
  "id" text PRIMARY KEY,
  "bankAccountId" text,
  "date" timestamp,
  "amount" double precision,
  "type" text,
  "description" text,
  "category" text,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "ClientPayment" (
  "id" text PRIMARY KEY,
  "projectId" text,
  "clientId" text,
  "payment_account_id" integer,
  "description" text,
  "document_link" varchar(500),
  "title" text,
  "amount" double precision,
  "status" text,
  "created_transaction_id" integer,
  "confirmed" boolean,
  "confirmedAt" timestamp,
  "confirmedBy" text,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  "pm_approval_notes" text
);

CREATE TABLE "DismissedWeek" (
  "id" text PRIMARY KEY,
  "monitoredUserId" text,
  "weekStartDate" timestamp,
  "weekEndDate" timestamp,
  "reason" text,
  "dismissedBy" text,
  "createdAt" timestamp
);

CREATE TABLE "EmployeeReview" (
  "id" text PRIMARY KEY,
  "employeeId" text,
  "reviewerId" text,
  "rating" double precision,
  "comment" text,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  "monthlySalaryId" text,
  "projectWageId" text
);

CREATE TABLE "Equipment" (
  "id" text PRIMARY KEY,
  "projectId" text,
  "name" text,
  "description" text,
  "costPerMonth" double precision,
  "handoverDate" timestamp,
  "delivered" boolean,
  "deliveredDate" timestamp,
  "paid" boolean,
  "paidDate" timestamp,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  "costPerWeek" double precision,
  "fixedPrice" double precision,
  "returnDate" timestamp,
  "type" text
);

CREATE TABLE "Estimate" (
  "id" text PRIMARY KEY,
  "name" text,
  "costPerHour" double precision,
  "tasks" jsonb,
  "totalAmount" double precision,
  "totalHours" double precision,
  "projectId" text,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  "createdById" text
);

CREATE TABLE "ExternalPayment" (
  "id" text PRIMARY KEY,
  "payerName" text,
  "title" text,
  "amount" double precision,
  "description" text,
  "status" text,
  "paymentDate" timestamp,
  "paidDate" timestamp,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "GeneralPayment" (
  "id" text PRIMARY KEY,
  "recordedBy" text,
  "title" text,
  "amount" double precision,
  "description" text,
  "category" text,
  "paymentDate" timestamp,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "InventoryItem" (
  "id" text PRIMARY KEY,
  "name" text,
  "description" text,
  "count" integer,
  "pricePerItem" double precision,
  "totalPrice" double precision,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "KPIEvaluation" (
  "id" text PRIMARY KEY,
  "monitoredUserId" text,
  "evaluatedBy" text,
  "weekStartDate" timestamp,
  "weekEndDate" timestamp,
  "overallNotes" text,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "KPIEvaluationItem" (
  "id" text PRIMARY KEY,
  "evaluationId" text,
  "kpiIndicatorId" text,
  "value" double precision,
  "notes" text,
  "createdAt" timestamp
);

CREATE TABLE "KPIIndicator" (
  "id" text PRIMARY KEY,
  "monitoredUserId" text,
  "name" text,
  "description" text,
  "unit" text,
  "targetValue" double precision,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "MonitoredUser" (
  "id" text PRIMARY KEY,
  "userId" text,
  "addedBy" text,
  "isActive" boolean,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "MonthlySalary" (
  "id" text PRIMARY KEY,
  "employeeId" text,
  "month" text,
  "amount" double precision,
  "paymentStatus" text,
  "paidDate" timestamp,
  "notes" text,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "Notification" (
  "id" text PRIMARY KEY,
  "userId" text,
  "type" text,
  "title" text,
  "message" text,
  "read" boolean,
  "link" text,
  "metadata" jsonb,
  "createdAt" timestamp
);

CREATE TABLE "Project" (
  "id" text PRIMARY KEY,
  "code" varchar(32),
  "name" text,
  "description" text,
  "budget" double precision,
  "status" text,
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
  "account_id" integer,
  "client_id" text,
  "client_password" varchar(255)
);

CREATE TABLE "ProjectAssignment" (
  "id" text PRIMARY KEY,
  "projectId" text,
  "userId" text,
  "createdAt" timestamp
);

CREATE TABLE "ProjectBankAssignment" (
  "id" text PRIMARY KEY,
  "projectId" text,
  "bankAccountId" text,
  "createdAt" timestamp
);

CREATE TABLE "ProjectLink" (
  "id" text PRIMARY KEY,
  "projectId" text,
  "title" text,
  "url" text,
  "isEstimate" boolean,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "ProjectWage" (
  "id" text PRIMARY KEY,
  "projectId" text,
  "employeeId" text,
  "amount" double precision,
  "description" text,
  "paymentStatus" text,
  "paidDate" timestamp,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "Signature" (
  "id" text PRIMARY KEY,
  "agreementId" text,
  "userId" text,
  "signerName" text,
  "confirmed" boolean,
  "confirmText" text,
  "signedAt" timestamp,
  "createdAt" timestamp
);

CREATE TABLE "Template" (
  "id" text PRIMARY KEY,
  "name" text,
  "type" text,
  "content" jsonb,
  "isPremade" boolean,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "User" (
  "id" text PRIMARY KEY,
  "email" text,
  "username" text,
  "password" text,
  "name" text,
  "role" text,
  "employmentType" text,
  "monthlySalary" double precision,
  "bankAccountName" text,
  "bankAccountNumber" text,
  "bankName" text,
  "bankBranch" text,
  "bankNotes" text,
  "level" integer,
  "lastSeen" timestamp,
  "post" text,
  "petty_cash_account_id" integer,
  "is_active" boolean,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "WagePayment" (
  "id" text PRIMARY KEY,
  "projectWageId" text,
  "monthlySalaryId" text,
  "amount" double precision,
  "paidDate" timestamp,
  "notes" text,
  "createdAt" timestamp,
  "updatedAt" timestamp
);

CREATE TABLE "_prisma_migrations" (
  "id" varchar(36) PRIMARY KEY,
  "checksum" varchar(64),
  "finished_at" timestamp,
  "migration_name" varchar(255),
  "logs" text,
  "rolled_back_at" timestamp,
  "started_at" timestamp,
  "applied_steps_count" integer
);

CREATE TABLE "transactions" (
  "id" integer PRIMARY KEY,
  "reference" varchar(100),
  "description" text,
  "created_by" text,
  "source_type" varchar(32),
  "source_id" text,
  "posted_at" timestamp,
  "document_link" varchar(500)
);

CREATE TABLE "transaction_entries" (
  "id" integer PRIMARY KEY,
  "transaction_id" integer,
  "account_id" integer,
  "entry_type" text,
  "amount" numeric(14,2),
  "is_checked" boolean
);

CREATE TABLE "project_manager_assignments" (
  "id" integer PRIMARY KEY,
  "project_id" text,
  "manager_id" text
);

CREATE TABLE "expenses" (
  "id" text PRIMARY KEY,
  "project_id" text,
  "employee_id" text,
  "description" text,
  "amount" numeric(14,2),
  "expense_date" date,
  "receipt_path" varchar(500),
  "payment_source" varchar(32),
  "status" text,
  "created_transaction_id" integer,
  "approved_by_pm_id" text,
  "final_expense_amount" numeric(14,2),
  "pm_approval_date" timestamp,
  "pm_approval_notes" text
);

COMMIT;

-- WARNING:
-- 1) Take a full DB backup before running this migration.
-- 2) Run in a maintenance window (it alters primary/foreign key column types).
-- 3) This migration is designed for the currently detected Render schema:
--    users/projects/project_assignments/client_payments with integer IDs.

BEGIN;

-- Drop all foreign keys in public schema so ID type changes can proceed.
DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.contype = 'f'
      AND n.nspname = 'public'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I',
      fk.schema_name,
      fk.table_name,
      fk.constraint_name
    );
  END LOOP;
END $$;

-- ---------------------------
-- users -> "User"
-- ---------------------------
ALTER TABLE IF EXISTS users ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE IF EXISTS users ALTER COLUMN email TYPE text;
ALTER TABLE IF EXISTS users ALTER COLUMN username TYPE text;
ALTER TABLE IF EXISTS users ALTER COLUMN full_name TYPE text;
ALTER TABLE IF EXISTS users ALTER COLUMN hashed_password TYPE text;

ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS "employmentType" text;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS "monthlySalary" double precision;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS "bankAccountName" text;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS "bankAccountNumber" text;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS "bankName" text;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS "bankBranch" text;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS "bankNotes" text;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS level integer;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS "lastSeen" timestamp;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS post text;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS "createdAt" timestamp NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS "updatedAt" timestamp NOT NULL DEFAULT now();

ALTER TABLE IF EXISTS users RENAME COLUMN full_name TO name;
ALTER TABLE IF EXISTS users RENAME COLUMN hashed_password TO password;

ALTER TABLE IF EXISTS users RENAME TO "User";

-- ---------------------------
-- projects -> "Project"
-- ---------------------------
ALTER TABLE IF EXISTS projects ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE IF EXISTS projects ALTER COLUMN client_id TYPE text USING CASE WHEN client_id IS NULL THEN NULL ELSE client_id::text END;
ALTER TABLE IF EXISTS projects ALTER COLUMN name TYPE text;
ALTER TABLE IF EXISTS projects ALTER COLUMN budget TYPE double precision USING budget::double precision;

ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS "financialStatus" text;
ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS "createdById" text;
ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS "projectManagerId" text;
ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS "progressDiscussion" boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS "progressEstimation" boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS "progressEmployeeAllocation" boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS "progressDevelopment" boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS "progressTesting" boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS "progressDeployment" boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS "createdAt" timestamp NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS "updatedAt" timestamp NOT NULL DEFAULT now();

ALTER TABLE IF EXISTS projects RENAME TO "Project";

-- ---------------------------
-- project_assignments -> "ProjectAssignment"
-- ---------------------------
ALTER TABLE IF EXISTS project_assignments ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE IF EXISTS project_assignments ALTER COLUMN project_id TYPE text USING project_id::text;
ALTER TABLE IF EXISTS project_assignments ALTER COLUMN employee_id TYPE text USING employee_id::text;
ALTER TABLE IF EXISTS project_assignments ADD COLUMN IF NOT EXISTS "createdAt" timestamp NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS project_assignments RENAME COLUMN project_id TO "projectId";
ALTER TABLE IF EXISTS project_assignments RENAME COLUMN employee_id TO "userId";
ALTER TABLE IF EXISTS project_assignments RENAME TO "ProjectAssignment";

-- ---------------------------
-- project_manager_assignments
-- ---------------------------
ALTER TABLE IF EXISTS project_manager_assignments ALTER COLUMN project_id TYPE text USING project_id::text;
ALTER TABLE IF EXISTS project_manager_assignments ALTER COLUMN manager_id TYPE text USING manager_id::text;

-- ---------------------------
-- expenses
-- ---------------------------
ALTER TABLE IF EXISTS expenses ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE IF EXISTS expenses ALTER COLUMN project_id TYPE text USING project_id::text;
ALTER TABLE IF EXISTS expenses ALTER COLUMN employee_id TYPE text USING employee_id::text;
ALTER TABLE IF EXISTS expenses ALTER COLUMN approved_by_pm_id TYPE text USING CASE WHEN approved_by_pm_id IS NULL THEN NULL ELSE approved_by_pm_id::text END;

-- ---------------------------
-- client_payments -> "ClientPayment"
-- ---------------------------
ALTER TABLE IF EXISTS client_payments ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE IF EXISTS client_payments ALTER COLUMN project_id TYPE text USING project_id::text;
ALTER TABLE IF EXISTS client_payments ALTER COLUMN client_id TYPE text USING client_id::text;
ALTER TABLE IF EXISTS client_payments ALTER COLUMN amount TYPE double precision USING amount::double precision;
ALTER TABLE IF EXISTS client_payments ALTER COLUMN approved_by_pm_id TYPE text USING CASE WHEN approved_by_pm_id IS NULL THEN NULL ELSE approved_by_pm_id::text END;

ALTER TABLE IF EXISTS client_payments ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE IF EXISTS client_payments ADD COLUMN IF NOT EXISTS confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS client_payments ADD COLUMN IF NOT EXISTS "confirmedAt" timestamp;
ALTER TABLE IF EXISTS client_payments ADD COLUMN IF NOT EXISTS "confirmedBy" text;
ALTER TABLE IF EXISTS client_payments ADD COLUMN IF NOT EXISTS "createdAt" timestamp NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS client_payments ADD COLUMN IF NOT EXISTS "updatedAt" timestamp NOT NULL DEFAULT now();

UPDATE client_payments
SET
  title = COALESCE(title, description, 'Client Payment'),
  confirmed = COALESCE(confirmed, false) OR status = 'APPROVED',
  "confirmedAt" = COALESCE("confirmedAt", pm_approval_date),
  "confirmedBy" = COALESCE("confirmedBy", approved_by_pm_id),
  "createdAt" = COALESCE("createdAt", payment_date::timestamp)
WHERE true;

ALTER TABLE IF EXISTS client_payments RENAME COLUMN project_id TO "projectId";
ALTER TABLE IF EXISTS client_payments RENAME COLUMN client_id TO "clientId";

ALTER TABLE IF EXISTS client_payments RENAME TO "ClientPayment";

-- ---------------------------
-- transactions (ID references now text)
-- ---------------------------
ALTER TABLE IF EXISTS transactions ALTER COLUMN created_by TYPE text USING created_by::text;
ALTER TABLE IF EXISTS transactions ALTER COLUMN source_id TYPE text USING CASE WHEN source_id IS NULL THEN NULL ELSE source_id::text END;

-- ---------------------------
-- Recreate critical foreign keys
-- ---------------------------
ALTER TABLE IF EXISTS "Project"
  ADD CONSTRAINT "Project_client_id_fkey"
  FOREIGN KEY (client_id) REFERENCES "User"(id);

ALTER TABLE IF EXISTS "ProjectAssignment"
  ADD CONSTRAINT "ProjectAssignment_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"(id);

ALTER TABLE IF EXISTS "ProjectAssignment"
  ADD CONSTRAINT "ProjectAssignment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"(id);

ALTER TABLE IF EXISTS expenses
  ADD CONSTRAINT expenses_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES "Project"(id);

ALTER TABLE IF EXISTS expenses
  ADD CONSTRAINT expenses_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES "User"(id);

ALTER TABLE IF EXISTS expenses
  ADD CONSTRAINT expenses_approved_by_pm_id_fkey
  FOREIGN KEY (approved_by_pm_id) REFERENCES "User"(id);

ALTER TABLE IF EXISTS "ClientPayment"
  ADD CONSTRAINT "ClientPayment_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"(id);

ALTER TABLE IF EXISTS "ClientPayment"
  ADD CONSTRAINT "ClientPayment_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "User"(id);

ALTER TABLE IF EXISTS "ClientPayment"
  ADD CONSTRAINT "ClientPayment_confirmedBy_fkey"
  FOREIGN KEY ("confirmedBy") REFERENCES "User"(id);

ALTER TABLE IF EXISTS project_manager_assignments
  ADD CONSTRAINT project_manager_assignments_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES "Project"(id);

ALTER TABLE IF EXISTS project_manager_assignments
  ADD CONSTRAINT project_manager_assignments_manager_id_fkey
  FOREIGN KEY (manager_id) REFERENCES "User"(id);

COMMIT;

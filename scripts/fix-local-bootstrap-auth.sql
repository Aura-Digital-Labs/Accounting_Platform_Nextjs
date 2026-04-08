BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'userrole'
  ) THEN
    CREATE TYPE public.userrole AS ENUM ('admin', 'employee', 'project_manager', 'client');
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'userrole'
  ) THEN
    ALTER TYPE public.userrole ADD VALUE IF NOT EXISTS 'ADMIN';
    ALTER TYPE public.userrole ADD VALUE IF NOT EXISTS 'EMPLOYEE';
    ALTER TYPE public.userrole ADD VALUE IF NOT EXISTS 'PROJECT_MANAGER';
    ALTER TYPE public.userrole ADD VALUE IF NOT EXISTS 'CLIENT';
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'userrole'
  ) THEN
    ALTER TYPE public.userrole ADD VALUE IF NOT EXISTS 'admin';
    ALTER TYPE public.userrole ADD VALUE IF NOT EXISTS 'employee';
    ALTER TYPE public.userrole ADD VALUE IF NOT EXISTS 'project_manager';
    ALTER TYPE public.userrole ADD VALUE IF NOT EXISTS 'client';
  END IF;
END$$;

DO $$
DECLARE
  role_data_type text;
  role_udt_name text;
BEGIN
  SELECT c.data_type, c.udt_name
  INTO role_data_type, role_udt_name
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'User'
    AND c.column_name = 'role';

  IF role_data_type IS NOT NULL AND role_udt_name <> 'userrole' THEN
    EXECUTE '
      ALTER TABLE public."User"
      ALTER COLUMN role TYPE public.userrole
      USING (
        CASE lower(role::text)
          WHEN ''admin'' THEN ''admin''::public.userrole
          WHEN ''employee'' THEN ''employee''::public.userrole
          WHEN ''project_manager'' THEN ''project_manager''::public.userrole
          WHEN ''client'' THEN ''client''::public.userrole
          ELSE ''employee''::public.userrole
        END
      )
    ';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'accounttype'
  ) THEN
    CREATE TYPE public.accounttype AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'accounttype'
  ) THEN
    ALTER TYPE public.accounttype ADD VALUE IF NOT EXISTS 'ASSET';
    ALTER TYPE public.accounttype ADD VALUE IF NOT EXISTS 'LIABILITY';
    ALTER TYPE public.accounttype ADD VALUE IF NOT EXISTS 'EQUITY';
    ALTER TYPE public.accounttype ADD VALUE IF NOT EXISTS 'REVENUE';
    ALTER TYPE public.accounttype ADD VALUE IF NOT EXISTS 'EXPENSE';
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.accounts (
  id serial PRIMARY KEY,
  code varchar(64) UNIQUE NOT NULL,
  name varchar(255) NOT NULL,
  type public.accounttype NOT NULL,
  description text,
  project_id integer UNIQUE,
  budget numeric(14,2),
  include_in_cash_flow boolean NOT NULL DEFAULT false,
  is_payment_accepting boolean NOT NULL DEFAULT false,
  is_petty_cash boolean NOT NULL DEFAULT false,
  is_closed boolean NOT NULL DEFAULT false,
  closed_at timestamp,
  account_number varchar(50),
  account_holder_name varchar(255),
  bank_branch varchar(255)
);

ALTER TABLE public.accounts
  ALTER COLUMN code TYPE varchar(64);

COMMIT;
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'transactions'
  ) THEN
    CREATE SEQUENCE IF NOT EXISTS public.transactions_id_seq;
    ALTER TABLE public.transactions ALTER COLUMN id SET DEFAULT nextval('public.transactions_id_seq');
    ALTER SEQUENCE public.transactions_id_seq OWNED BY public.transactions.id;
    PERFORM setval(
      'public.transactions_id_seq',
      COALESCE((SELECT MAX(id) FROM public.transactions), 0) + 1,
      false
    );
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'transaction_entries'
  ) THEN
    CREATE SEQUENCE IF NOT EXISTS public.transaction_entries_id_seq;
    ALTER TABLE public.transaction_entries ALTER COLUMN id SET DEFAULT nextval('public.transaction_entries_id_seq');
    ALTER SEQUENCE public.transaction_entries_id_seq OWNED BY public.transaction_entries.id;
    PERFORM setval(
      'public.transaction_entries_id_seq',
      COALESCE((SELECT MAX(id) FROM public.transaction_entries), 0) + 1,
      false
    );
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'project_manager_assignments'
  ) THEN
    CREATE SEQUENCE IF NOT EXISTS public.project_manager_assignments_id_seq;
    ALTER TABLE public.project_manager_assignments ALTER COLUMN id SET DEFAULT nextval('public.project_manager_assignments_id_seq');
    ALTER SEQUENCE public.project_manager_assignments_id_seq OWNED BY public.project_manager_assignments.id;
    PERFORM setval(
      'public.project_manager_assignments_id_seq',
      COALESCE((SELECT MAX(id) FROM public.project_manager_assignments), 0) + 1,
      false
    );
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'accounts'
  ) THEN
    CREATE SEQUENCE IF NOT EXISTS public.accounts_id_seq;
    ALTER TABLE public.accounts ALTER COLUMN id SET DEFAULT nextval('public.accounts_id_seq');
    ALTER SEQUENCE public.accounts_id_seq OWNED BY public.accounts.id;
    PERFORM setval(
      'public.accounts_id_seq',
      COALESCE((SELECT MAX(id) FROM public.accounts), 0) + 1,
      false
    );
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bank_statements'
  ) THEN
    CREATE SEQUENCE IF NOT EXISTS public.bank_statements_id_seq;
    ALTER TABLE public.bank_statements ALTER COLUMN id SET DEFAULT nextval('public.bank_statements_id_seq');
    ALTER SEQUENCE public.bank_statements_id_seq OWNED BY public.bank_statements.id;
    PERFORM setval(
      'public.bank_statements_id_seq',
      COALESCE((SELECT MAX(id) FROM public.bank_statements), 0) + 1,
      false
    );
  END IF;
END$$;

COMMIT;

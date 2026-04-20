
DO $$
BEGIN
    BEGIN
        CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'PENDING', 'SIGNED', 'COMPLETED');
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END
$$;


DO $$
BEGIN
    BEGIN
        CREATE TYPE "EmploymentType" AS ENUM ('CONTRACT', 'MONTHLY');
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END
$$;


DO $$
BEGIN
    BEGIN
        CREATE TYPE "EquipmentType" AS ENUM ('RENTAL', 'PURCHASE');
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END
$$;


DO $$
BEGIN
    BEGIN
        CREATE TYPE "FinancialStatus" AS ENUM ('NOT_PAID', 'ADVANCED_PAID', 'PAYMENT_90_PERCENT', 'FULL_PAYMENT_DONE');
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END
$$;


DO $$
BEGIN
    BEGIN
        CREATE TYPE "KPIUnit" AS ENUM ('COUNT', 'PERCENTAGE', 'TIME', 'UPDOWN');
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END
$$;


DO $$
BEGIN
    BEGIN
        CREATE TYPE "NotificationType" AS ENUM ('PROJECT_ASSIGNED', 'WAGE_ADDED', 'SALARY_PAID', 'WAGE_PAID', 'EQUIPMENT_ADDED', 'AGREEMENT_CREATED', 'AGREEMENT_SIGNED', 'PROJECT_STATUS_CHANGED', 'REVIEW_RECEIVED', 'PAYMENT_CONFIRMED');
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END
$$;


DO $$
BEGIN
    BEGIN
        CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'PARTIAL');
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END
$$;


DO $$
BEGIN
    BEGIN
        CREATE TYPE "ProjectStatus" AS ENUM ('IN_DISCUSSION', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ON_HOLD');
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END
$$;


DO $$
BEGIN
    BEGIN
        CREATE TYPE "Role" AS ENUM ('ADMIN', 'CLIENT', 'EMPLOYEE');
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END
$$;


DO $$
BEGIN
    BEGIN
        CREATE TYPE "TransactionType" AS ENUM ('CREDIT', 'DEBIT');
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END
$$;


-- ENUM DATA CLEANING

UPDATE "Notification"
SET "type" = 'PROJECT_ASSIGNED'
WHERE "type" IS NOT NULL
AND "type"::text NOT IN ('PROJECT_ASSIGNED', 'WAGE_ADDED', 'SALARY_PAID', 'WAGE_PAID', 'EQUIPMENT_ADDED', 'AGREEMENT_CREATED', 'AGREEMENT_SIGNED', 'PROJECT_STATUS_CHANGED', 'REVIEW_RECEIVED', 'PAYMENT_CONFIRMED');


UPDATE "Agreement"
SET "status" = 'DRAFT'
WHERE "status" IS NOT NULL
AND "status"::text NOT IN ('DRAFT', 'PENDING', 'SIGNED', 'COMPLETED');


UPDATE "Project"
SET "status" = 'IN_DISCUSSION'
WHERE "status" IS NOT NULL
AND "status"::text NOT IN ('IN_DISCUSSION', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ON_HOLD');


UPDATE "MonthlySalary"
SET "paymentStatus" = 'PENDING'
WHERE "paymentStatus" IS NOT NULL
AND "paymentStatus"::text NOT IN ('PENDING', 'PAID', 'PARTIAL');


UPDATE "Equipment"
SET "type" = 'RENTAL'
WHERE "type" IS NOT NULL
AND "type"::text NOT IN ('RENTAL', 'PURCHASE');


UPDATE "ProjectWage"
SET "paymentStatus" = 'PENDING'
WHERE "paymentStatus" IS NOT NULL
AND "paymentStatus"::text NOT IN ('PENDING', 'PAID', 'PARTIAL');


UPDATE "BankTransaction"
SET "type" = 'CREDIT'
WHERE "type" IS NOT NULL
AND "type"::text NOT IN ('CREDIT', 'DEBIT');


UPDATE "ExternalPayment"
SET "status" = 'PENDING'
WHERE "status" IS NOT NULL
AND "status"::text NOT IN ('PENDING', 'PAID', 'PARTIAL');


UPDATE "Project"
SET "financialStatus" = 'NOT_PAID'
WHERE "financialStatus" IS NOT NULL
AND "financialStatus"::text NOT IN ('NOT_PAID', 'ADVANCED_PAID', 'PAYMENT_90_PERCENT', 'FULL_PAYMENT_DONE');


UPDATE "User"
SET "role" = 'ADMIN'
WHERE "role" IS NOT NULL
AND "role"::text NOT IN ('ADMIN', 'CLIENT', 'EMPLOYEE');


UPDATE "KPIIndicator"
SET "unit" = 'COUNT'
WHERE "unit" IS NOT NULL
AND "unit"::text NOT IN ('COUNT', 'PERCENTAGE', 'TIME', 'UPDOWN');


UPDATE "User"
SET "employmentType" = 'CONTRACT'
WHERE "employmentType" IS NOT NULL
AND "employmentType"::text NOT IN ('CONTRACT', 'MONTHLY');


-- ALTER
ALTER TABLE "Notification" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType" USING "type"::text::"NotificationType";
ALTER TABLE "Agreement" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Agreement" ALTER COLUMN "status" TYPE "AgreementStatus" USING "status"::text::"AgreementStatus";
ALTER TABLE "Agreement" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"AgreementStatus";
ALTER TABLE "Project" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Project" ALTER COLUMN "status" TYPE "ProjectStatus" USING "status"::text::"ProjectStatus";
ALTER TABLE "Project" ALTER COLUMN "status" SET DEFAULT 'IN_DISCUSSION'::"ProjectStatus";
ALTER TABLE "MonthlySalary" ALTER COLUMN "paymentStatus" DROP DEFAULT;
ALTER TABLE "MonthlySalary" ALTER COLUMN "paymentStatus" TYPE "PaymentStatus" USING "paymentStatus"::text::"PaymentStatus";
ALTER TABLE "MonthlySalary" ALTER COLUMN "paymentStatus" SET DEFAULT 'PENDING'::"PaymentStatus";
ALTER TABLE "Equipment" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Equipment" ALTER COLUMN "type" TYPE "EquipmentType" USING "type"::text::"EquipmentType";
ALTER TABLE "Equipment" ALTER COLUMN "type" SET DEFAULT 'RENTAL'::"EquipmentType";
ALTER TABLE "ProjectWage" ALTER COLUMN "paymentStatus" DROP DEFAULT;
ALTER TABLE "ProjectWage" ALTER COLUMN "paymentStatus" TYPE "PaymentStatus" USING "paymentStatus"::text::"PaymentStatus";
ALTER TABLE "ProjectWage" ALTER COLUMN "paymentStatus" SET DEFAULT 'PENDING'::"PaymentStatus";
ALTER TABLE "BankTransaction" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "BankTransaction" ALTER COLUMN "type" TYPE "TransactionType" USING "type"::text::"TransactionType";
ALTER TABLE "ExternalPayment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ExternalPayment" ALTER COLUMN "status" TYPE "PaymentStatus" USING "status"::text::"PaymentStatus";
ALTER TABLE "ExternalPayment" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"PaymentStatus";
ALTER TABLE "_prisma_migrations" ALTER COLUMN "rolled_back_at" DROP DEFAULT;
ALTER TABLE "_prisma_migrations" ALTER COLUMN "rolled_back_at" TYPE "timestamptz" USING "rolled_back_at"::text::"timestamptz";
ALTER TABLE "Project" ALTER COLUMN "financialStatus" DROP DEFAULT;
ALTER TABLE "Project" ALTER COLUMN "financialStatus" TYPE "FinancialStatus" USING "financialStatus"::text::"FinancialStatus";
ALTER TABLE "Project" ALTER COLUMN "financialStatus" SET DEFAULT 'NOT_PAID'::"FinancialStatus";
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING "role"::text::"Role";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'CLIENT'::"Role";
ALTER TABLE "KPIIndicator" ALTER COLUMN "unit" DROP DEFAULT;
ALTER TABLE "KPIIndicator" ALTER COLUMN "unit" TYPE "KPIUnit" USING "unit"::text::"KPIUnit";
ALTER TABLE "_prisma_migrations" ALTER COLUMN "finished_at" DROP DEFAULT;
ALTER TABLE "_prisma_migrations" ALTER COLUMN "finished_at" TYPE "timestamptz" USING "finished_at"::text::"timestamptz";
ALTER TABLE "User" ALTER COLUMN "employmentType" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "employmentType" TYPE "EmploymentType" USING "employmentType"::text::"EmploymentType";
ALTER TABLE "_prisma_migrations" ALTER COLUMN "started_at" DROP DEFAULT;
ALTER TABLE "_prisma_migrations" ALTER COLUMN "started_at" TYPE "timestamptz" USING "started_at"::text::"timestamptz";
ALTER TABLE "_prisma_migrations" ALTER COLUMN "started_at" SET DEFAULT now();

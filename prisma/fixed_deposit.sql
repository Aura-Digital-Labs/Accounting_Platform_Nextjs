CREATE TABLE "fixed_deposits" (
    "id" SERIAL NOT NULL,
    "bank_name" VARCHAR(255) NOT NULL,
    "account_number" VARCHAR(255) NOT NULL,
    "initial_investment_account_id" INTEGER NOT NULL,
    "fd_account_id" INTEGER NOT NULL,
    "starting_date" DATE NOT NULL,
    "period_type" VARCHAR(10) NOT NULL,
    "period_value" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference_document_url" VARCHAR(500),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT NOT NULL,

    CONSTRAINT "fixed_deposits_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "fixed_deposits" ADD CONSTRAINT "fixed_deposits_initial_investment_account_id_fkey" FOREIGN KEY ("initial_investment_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_deposits" ADD CONSTRAINT "fixed_deposits_fd_account_id_fkey" FOREIGN KEY ("fd_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_deposits" ADD CONSTRAINT "fixed_deposits_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
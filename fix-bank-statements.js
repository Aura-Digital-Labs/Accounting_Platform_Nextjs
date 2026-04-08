const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "bank_statements" (
      "id" SERIAL NOT NULL,
      "account_id" INTEGER NOT NULL,
      "month" VARCHAR(7) NOT NULL,
      "statement_link" VARCHAR(500) NOT NULL,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id")
    );
  `);
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    `);
  } catch(e) { console.log("FK possibly exists"); }
  console.log("Done");
}
main();

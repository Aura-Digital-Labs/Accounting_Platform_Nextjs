import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting script to fix null values...");
  // Use raw sql to bypass Prisma client schema mapping
  const accounts = await prisma.$queryRaw`SELECT id FROM accounts LIMIT 1`;
  if (!accounts || accounts.length === 0) {
    console.log("No accounts found, cannot fix.");
    return;
  }

  const accountId = accounts[0].id;
  console.log(`Using default account ID: ${accountId}`);

  // Fix ClientPayment table
  await prisma.$executeRaw`UPDATE "ClientPayment" SET payment_account_id = ${accountId} WHERE payment_account_id IS NULL`;
  await prisma.$executeRaw`UPDATE "ClientPayment" SET status = 'APPROVED' WHERE status IS NULL`;
  console.log("Fixed ClientPayment.");

  // Fix Project (projects) table
  await prisma.$executeRaw`UPDATE "Project" SET account_id = ${accountId} WHERE account_id IS NULL`;
  console.log("Fixed projects.");

  // Fix transactions table
  await prisma.$executeRaw`UPDATE "transactions" SET posted_at = current_timestamp WHERE posted_at IS NULL`;
  console.log("Fixed transactions.");

  console.log("DONE");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

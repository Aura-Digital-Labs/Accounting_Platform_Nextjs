// @ts-nocheck
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Fixing accounts table sequence...");
  
  // Get max id directly and reset sequence
  try {
    await prisma.$executeRaw`SELECT setval('accounts_id_seq', COALESCE((SELECT MAX(id) FROM accounts), 1))`;
    console.log("Sequence reset successfully.");
  } catch (e) {
    console.error("Failed using setval directly:", e.message);
  }
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

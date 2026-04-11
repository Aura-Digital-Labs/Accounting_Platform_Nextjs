import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Project" ADD COLUMN "last_invoice_no" VARCHAR(255) NULL;`);
    console.log("Added last_invoice_no");
  } catch (e) {
    console.log(e.message);
  }
  
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Project" ADD COLUMN "invoice_count" INTEGER NOT NULL DEFAULT 0;`);
    console.log("Added invoice_count");
  } catch (e) {
    console.log(e.message);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
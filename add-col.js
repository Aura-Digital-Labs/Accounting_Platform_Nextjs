const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe("ALTER TABLE accounts ADD COLUMN bank_name VARCHAR(255);");
  console.log("Column 'bank_name' added to 'accounts' table.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
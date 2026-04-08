require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT id, code, name, account_id, client_id, "createdAt"
      FROM "Project"
      ORDER BY "createdAt" DESC
      LIMIT 20
    `);
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

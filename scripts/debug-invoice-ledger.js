require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const accountId = Number(process.argv[2] || 12);
    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        t.id,
        t.posted_at,
        t.description,
        t.source_type,
        t.source_id,
        te.entry_type::text AS entry_type,
        te.amount,
        te.account_id
      FROM transactions t
      INNER JOIN transaction_entries te ON te.transaction_id = t.id
      WHERE te.account_id = ${accountId}
      ORDER BY t.posted_at ASC, t.id ASC, te.id ASC
    `);

    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

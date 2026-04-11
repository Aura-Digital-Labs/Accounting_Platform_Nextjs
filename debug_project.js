const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const p = await prisma.project.findFirst({
    include: { account: true }
  });
  if (!p) { return; }
  const tx = await prisma.$queryRaw`
    SELECT
      t.id AS "transactionId",
      t.posted_at AS "postedAt",
      t.source_type AS "sourceType",
      t.source_id AS "sourceId",
      te.entry_type::text AS "entryType",
      te.amount
    FROM transactions t
    INNER JOIN transaction_entries te ON te.transaction_id = t.id
    WHERE te.account_id = ${p.accountId}
  `;
  console.log('Project Budget:', p.budget);
  console.log('Payments:', JSON.stringify(p.ClientPayment));
  console.log('Transactions:', JSON.stringify(tx, null, 2));
}
main().finally(() => prisma.$disconnect());
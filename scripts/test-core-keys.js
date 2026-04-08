require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const checks = [];

    const transactions = await prisma.$queryRawUnsafe(`
      SELECT id, description, posted_at
      FROM transactions
      ORDER BY posted_at DESC
      LIMIT 20
    `);
    checks.push({ name: "transactions_read", ok: true, count: transactions.length });

    const trialRows = await prisma.$queryRawUnsafe(`
      SELECT a.id AS account_id, a.code, a.name, te.entry_type::text AS entry_type, te.amount
      FROM accounts a
      LEFT JOIN transaction_entries te ON te.account_id = a.id
      ORDER BY a.code ASC
      LIMIT 2000
    `);
    checks.push({ name: "trial_balance_base_query", ok: true, count: trialRows.length });

    const cashRows = await prisma.$queryRawUnsafe(`
      SELECT entry_type::text AS entry_type, amount
      FROM transaction_entries
      LIMIT 2000
    `);
    checks.push({ name: "cash_flow_base_query", ok: true, count: cashRows.length });

    const txEntryCols = await prisma.$queryRawUnsafe(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='transaction_entries'
      ORDER BY ordinal_position
    `);
    checks.push({ name: "transaction_entries_columns", ok: true, count: txEntryCols.length });

    console.log(JSON.stringify({ ok: true, checks }, null, 2));
  } catch (error) {
    console.error("TEST_FAILED", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();

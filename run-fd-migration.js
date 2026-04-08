const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
async function run() {
  const sql = fs.readFileSync('prisma/fixed_deposit.sql', 'utf8');
  for (const statement of sql.split(';')) {
    if (statement.trim()) {
      await prisma.$executeRawUnsafe(statement);
    }
  }
}
run().catch(console.error).finally(() => prisma.$disconnect());
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const projects = await prisma.project.findMany({ include: { account: { include: { entries: { include: { transaction: true } } } } } });
  const p = projects.find(p => p.account && p.account.entries.length > 0);
  if (!p) return;
  console.log('Project', p.id, p.name);
  console.log(p.account.entries.map(e => ({
    amount: e.amount,
    type: e.entryType,
    desc: e.transaction.description,
    src: e.transaction.sourceType,
  })));
}
main().catch(console.error).finally(() => prisma.$disconnect());
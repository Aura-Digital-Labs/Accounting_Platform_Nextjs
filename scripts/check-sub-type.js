const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.$queryRaw`SELECT sub_type FROM accounts LIMIT 1`
  .then(console.log)
  .catch(console.error)
  .finally(() => p.$disconnect());
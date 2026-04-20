const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkEnums() {
  try {
    const res = await prisma.$queryRaw`SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname IN ('Role', 'userrole', 'user_role');`;
    console.log(res);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
checkEnums();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixUsers() {
  try {
    const res = await prisma.$executeRawUnsafe('UPDATE "User" SET is_active = true WHERE is_active IS NULL');
    console.log('Successfully fixed', res, 'user records where is_active was null');
  } catch (err) {
    console.error('Error fixing users:', err);
  } finally {
    await prisma.$disconnect();
  }
}

fixUsers();

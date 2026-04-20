const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixEnums() {
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FINANCIAL_OFFICER';`);
    await prisma.$executeRawUnsafe(`ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PROJECT_MANAGER';`);
    console.log("Enums altered successfully.");
  } catch (e) {
    console.error("Error altering enum:", e);
  } finally {
    await prisma.$disconnect();
  }
}
fixEnums();
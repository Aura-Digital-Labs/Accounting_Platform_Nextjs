const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE fixed_deposits ADD COLUMN expected_interest DECIMAL(14,2) DEFAULT 0 NOT NULL');
    console.log('Added expected_interest column successfully');
  } catch (e) {
    if (e.message.includes('already exists')) {
      console.log('Column already exists');
    } else {
      console.error(e);
    }
  }
}
run().finally(() => prisma.$disconnect());
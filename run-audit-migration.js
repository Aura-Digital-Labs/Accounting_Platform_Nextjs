const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "resource_type" VARCHAR(64) NOT NULL,
        "resource_id" TEXT,
        "description" TEXT,
        "old_values" JSONB,
        "new_values" JSONB,
        "ip_address" VARCHAR(45),
        "user_agent" TEXT,
        "status" VARCHAR(32) NOT NULL,
        "error_message" TEXT,
        "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
    );
  `);
  
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_user_id_fkey') THEN
        ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "audit_logs_user_id_idx" ON "audit_logs"("user_id");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "audit_logs_resource_type_idx" ON "audit_logs"("resource_type");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "audit_logs_resource_id_idx" ON "audit_logs"("resource_id");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");`);
  
  console.log("Created audit_logs table and indices");
}
main().catch(console.error).finally(() => prisma.$disconnect());
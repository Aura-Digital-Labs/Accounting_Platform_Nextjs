import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Checking users with duplicate or null emails...");
  
  // Find duplicate emails
  const counts = await prisma.$queryRaw`
    SELECT email, COUNT(*) as c
    FROM "User"
    WHERE email IS NOT NULL AND email != ''
    GROUP BY email
    HAVING COUNT(*) > 1
  `;
  console.log("Duplicate emails:", counts);
  
  const nulls = await prisma.$queryRaw`
    SELECT id, email FROM "User" WHERE email IS NULL OR email = ''
  `;
  console.log("Null/empty emails:", nulls.length);
  
  // Fix nulls
  for (let i = 0; i < nulls.length; i++) {
     const pId = nulls[i].id;
     await prisma.$executeRaw`UPDATE "User" SET email = 'null_' || ${i} || '@test.com' WHERE id = ${pId}`;
  }
  
  // Fix duplicates
  for (const row of counts) {
     const email = row.email;
     const users = await prisma.$queryRaw`SELECT id FROM "User" WHERE email = ${email} ORDER BY id`;
     // leave the first one intact
     for (let i = 1; i < users.length; i++) {
        const uId = users[i].id;
        await prisma.$executeRaw`UPDATE "User" SET email = 'dup_' || ${i} || '_' || ${email} WHERE id = ${uId}`;
     }
  }

  console.log("Users fixed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
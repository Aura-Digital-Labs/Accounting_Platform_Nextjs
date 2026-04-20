// @ts-nocheck
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Fixing projects that have duplicate account_ids...");
  
  // Find projects that have duplicate account_id
  const projects = await prisma.$queryRaw`SELECT id FROM "Project"`;
  if (!projects || projects.length === 0) {
    console.log("No projects found");
    return;
  }
  
  // Get unique accounts for each
  for(let i = 0; i < projects.length; i++) {
     const pId = projects[i].id;
     // Create a new account for each
     const newAcc = await prisma.$queryRaw`INSERT INTO accounts (code, name, type) VALUES ('FIX-' || left(${pId}, 10), left('Project Fix ' || ${i}, 100), 'ASSET') RETURNING id`;
     const newAccId = newAcc[0].id;
     await prisma.$executeRaw`UPDATE "Project" SET account_id = ${newAccId} WHERE id = ${pId}`;
  }
  console.log("Fixed projects unique constraint.");
  console.log("DONE");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

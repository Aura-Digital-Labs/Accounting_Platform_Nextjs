require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

async function main() {
  const prisma = new PrismaClient();
  const code = `DBG${Date.now().toString().slice(-6)}`;
  const name = "Debug Project";

  try {
    const admin = await prisma.user.findFirst({ where: { role: "admin" } });
    if (!admin) {
      console.log("No admin found");
      return;
    }

    await prisma.$transaction(async (tx) => {
      const clientEmail = `client_${code.toLowerCase()}@example.com`;
      const clientRandomPassword = "debug1234";

      const clientUser = await tx.user.create({
        data: {
          email: clientEmail,
          username: `client_${code.toLowerCase()}`,
          name: `Client - ${name}`,
          password: await bcrypt.hash(clientRandomPassword, 10),
          role: "client",
        },
      });

      const projectAccount = await tx.account.create({
        data: {
          code: `PRJ-${code}`,
          name: `Project Asset - ${name}`,
          type: "asset",
          description: `Asset account for project ${code}`,
          budget: 0,
        },
      });

      await tx.project.create({
        data: {
          code,
          name,
          description: null,
          budget: 0,
          accountId: projectAccount.id,
          clientId: clientUser.id,
        },
      });
    });

    console.log("PROJECT_CREATE_OK", code);
  } catch (error) {
    console.error("PROJECT_CREATE_ERROR", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

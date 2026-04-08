require("dotenv").config();
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  const email = (process.env.INITIAL_ADMIN_EMAIL || "admin@example.com").trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD || "admin123";
  const name = (process.env.INITIAL_ADMIN_NAME || "System Admin").trim();

  try {
    const hashed = await bcrypt.hash(password, 10);
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: email, mode: "insensitive" } },
          { username: { equals: email, mode: "insensitive" } },
        ],
      },
    });

    let user;
    if (existing) {
      user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          email,
          name,
          password: hashed,
          role: "admin",
          isActive: true,
        },
      });
      console.log(`Updated existing admin user: ${user.id} (${user.email})`);
    } else {
      user = await prisma.user.create({
        data: {
          email,
          username: null,
          name,
          password: hashed,
          role: "admin",
          isActive: true,
        },
      });
      console.log(`Created admin user: ${user.id} (${user.email})`);
    }

    const code = `ADM-${user.id}`;
    const accountName = `Admin Equity ${user.name}`;

    const account = await prisma.account.upsert({
      where: { code },
      create: {
        code,
        name: accountName,
        type: "equity",
      },
      update: {
        name: accountName,
        type: "equity",
      },
    });

    console.log(`Ensured admin account: ${account.code}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

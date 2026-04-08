require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const candidates = await prisma.$queryRawUnsafe(`
      SELECT id, email, username
      FROM "User"
      WHERE email <> btrim(email)
         OR (username IS NOT NULL AND username <> btrim(username))
      ORDER BY "createdAt" DESC
    `);

    if (!candidates.length) {
      console.log("No users require identifier normalization.");
      return;
    }

    console.log(`Found ${candidates.length} users with whitespace in identifiers.`);

    for (const row of candidates) {
      const normalizedEmail = String(row.email || "").trim().toLowerCase();
      const normalizedUsername =
        row.username == null || String(row.username).trim().length === 0
          ? null
          : String(row.username).trim();

      await prisma.$executeRawUnsafe(
        `
          UPDATE "User"
          SET email = $1,
              username = $2,
              is_active = COALESCE(is_active, true)
          WHERE id = $3
        `,
        normalizedEmail,
        normalizedUsername,
        String(row.id)
      );

      console.log(
        `Normalized user ${row.id}: email='${row.email}' -> '${normalizedEmail}', username='${row.username}' -> '${normalizedUsername}'`
      );
    }

    console.log("Identifier normalization complete.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

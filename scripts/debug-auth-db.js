require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const enums = await prisma.$queryRawUnsafe(`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname IN ('userrole', 'accounttype')
      ORDER BY t.typname, e.enumsortorder
    `);

    const users = await prisma.$queryRawUnsafe(`
      SELECT id, email, role::text AS role, "createdAt"
      FROM "User"
      ORDER BY "createdAt" DESC
      LIMIT 10
    `);

    const userCount = await prisma.user.count();

    const usersWithMissingPassword = await prisma.$queryRawUnsafe(`
      SELECT id, email, role::text AS role, is_active
      FROM "User"
      WHERE password IS NULL OR btrim(password) = ''
      ORDER BY "createdAt" DESC
      LIMIT 50
    `);

    const inactiveUsers = await prisma.$queryRawUnsafe(`
      SELECT id, email, role::text AS role, is_active
      FROM "User"
      WHERE is_active = false
      ORDER BY "createdAt" DESC
      LIMIT 50
    `);

    const usersWithWhitespaceIdentifiers = await prisma.$queryRawUnsafe(`
      SELECT id, email, username, role::text AS role
      FROM "User"
      WHERE email <> btrim(email)
         OR (username IS NOT NULL AND username <> btrim(username))
      ORDER BY "createdAt" DESC
      LIMIT 50
    `);

    const usersWithWhitespacePassword = await prisma.$queryRawUnsafe(`
      SELECT id, email, role::text AS role
      FROM "User"
      WHERE password <> btrim(password)
      ORDER BY "createdAt" DESC
      LIMIT 50
    `);

    const usersWithNonBcryptPassword = await prisma.$queryRawUnsafe(`
      SELECT id, email, role::text AS role
      FROM "User"
      WHERE password IS NOT NULL
        AND btrim(password) <> ''
        AND btrim(password) !~ '^\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$'
      ORDER BY "createdAt" DESC
      LIMIT 50
    `);

    let accountTableExists = false;
    try {
      const rows = await prisma.$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'accounts'
        ) AS exists
      `);
      accountTableExists = Boolean(rows?.[0]?.exists);
    } catch {
      accountTableExists = false;
    }

    console.log("ENUMS", JSON.stringify(enums));
    console.log("USER_COUNT", userCount);
    console.log("USERS", JSON.stringify(users));
    console.log(
      "USERS_WITH_MISSING_PASSWORD_COUNT",
      usersWithMissingPassword.length
    );
    console.log(
      "USERS_WITH_MISSING_PASSWORD",
      JSON.stringify(usersWithMissingPassword)
    );
    console.log("INACTIVE_USERS_COUNT", inactiveUsers.length);
    console.log("INACTIVE_USERS", JSON.stringify(inactiveUsers));
    console.log(
      "USERS_WITH_WHITESPACE_IDENTIFIERS_COUNT",
      usersWithWhitespaceIdentifiers.length
    );
    console.log(
      "USERS_WITH_WHITESPACE_IDENTIFIERS",
      JSON.stringify(usersWithWhitespaceIdentifiers)
    );
    console.log(
      "USERS_WITH_WHITESPACE_PASSWORD_COUNT",
      usersWithWhitespacePassword.length
    );
    console.log(
      "USERS_WITH_WHITESPACE_PASSWORD",
      JSON.stringify(usersWithWhitespacePassword)
    );
    console.log(
      "USERS_WITH_NON_BCRYPT_PASSWORD_COUNT",
      usersWithNonBcryptPassword.length
    );
    console.log(
      "USERS_WITH_NON_BCRYPT_PASSWORD",
      JSON.stringify(usersWithNonBcryptPassword)
    );
    console.log("ACCOUNTS_TABLE_EXISTS", accountTableExists);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

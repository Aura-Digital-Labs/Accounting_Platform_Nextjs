require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const tables = await prisma.$queryRawUnsafe(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('Project', 'ProjectAssignment', 'User', 'accounts', 'project_manager_assignments')
      ORDER BY table_name
    `);

    const cols = await prisma.$queryRawUnsafe(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('Project', 'ProjectAssignment', 'User')
      ORDER BY table_name, ordinal_position
    `);

    console.log("TABLES", JSON.stringify(tables));
    console.log("COLS", JSON.stringify(cols));

    const projects = await prisma.project.findMany({
      orderBy: { id: "desc" },
      include: {
        client: { select: { username: true } },
        assignments: { select: { userId: true } },
      },
    });

    console.log("PROJECTS_OK", projects.length);
  } catch (error) {
    console.error("PROJECTS_QUERY_ERROR", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

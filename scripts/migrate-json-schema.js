#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

function parseArgs(argv) {
  const args = {
    schemaFile: null,
    url: process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL || null,
    reset: false,
    dryRun: false,
    outFile: null,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];

    if (!args.schemaFile && !token.startsWith("--")) {
      args.schemaFile = token;
      continue;
    }

    if (token === "--url") {
      i += 1;
      args.url = argv[i] || null;
      continue;
    }

    if (token === "--out") {
      i += 1;
      args.outFile = argv[i] || null;
      continue;
    }

    if (token === "--reset") {
      args.reset = true;
      continue;
    }

    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (!args.schemaFile) {
    throw new Error("Missing schema file path. Usage: node scripts/migrate-json-schema.js <schema.json> [--url <postgres-url>] [--reset] [--dry-run] [--out <sql-file>]");
  }

  return args;
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function toDbType(rawType) {
  const t = String(rawType || "").trim();
  const lower = t.toLowerCase();

  if (lower === "text") return "text";
  if (lower === "integer") return "integer";
  if (lower === "double") return "double precision";
  if (lower === "boolean") return "boolean";
  if (lower === "timestamp") return "timestamp";
  if (lower === "date") return "date";
  if (lower === "jsonb") return "jsonb";

  if (/^varchar\(\d+\)$/i.test(t)) {
    return t.toLowerCase();
  }

  if (/^numeric\(\d+,\d+\)$/i.test(t)) {
    return t.toLowerCase();
  }

  if (/^enum\(.+\)$/i.test(t)) {
    // Enum values are not included in the JSON, so map safely to text.
    return "text";
  }

  throw new Error(`Unsupported column type: ${rawType}`);
}

function normalizeSchemaObject(json) {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("Schema file must contain a top-level JSON object: { tableName: { column: type } }");
  }

  const tables = [];
  for (const [tableName, cols] of Object.entries(json)) {
    if (!cols || typeof cols !== "object" || Array.isArray(cols)) {
      throw new Error(`Table '${tableName}' must be an object of { columnName: typeString }`);
    }

    const columns = [];
    for (const [col, type] of Object.entries(cols)) {
      columns.push({ name: col, dbType: toDbType(type) });
    }

    tables.push({
      name: tableName,
      columns,
      hasId: Object.prototype.hasOwnProperty.call(cols, "id"),
    });
  }

  return tables;
}

function buildSql(tables, reset) {
  const parts = [];
  parts.push("BEGIN;");

  if (reset) {
    parts.push("DROP SCHEMA IF EXISTS public CASCADE;");
    parts.push("CREATE SCHEMA public;");
  }

  for (const table of tables) {
    const colLines = table.columns.map((col) => {
      if (table.hasId && col.name === "id") {
        return `  ${quoteIdent(col.name)} ${col.dbType} PRIMARY KEY`;
      }
      return `  ${quoteIdent(col.name)} ${col.dbType}`;
    });

    const createSql = `CREATE TABLE ${quoteIdent(table.name)} (\n${colLines.join(",\n")}\n);`;
    parts.push(createSql);
  }

  parts.push("COMMIT;");
  return parts.join("\n\n") + "\n";
}

function writeSql(sql, requestedOutFile) {
  if (requestedOutFile) {
    const abs = path.resolve(process.cwd(), requestedOutFile);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, sql, "utf8");
    return abs;
  }

  const dir = path.join(process.cwd(), "scripts", ".generated");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `schema-migration-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  fs.writeFileSync(file, sql, "utf8");
  return file;
}

function applySql(sqlPath, url) {
  if (!url) {
    throw new Error("No database URL. Provide --url or set LOCAL_DATABASE_URL/DATABASE_URL.");
  }

  const command = `npx prisma db execute --url "${url.replace(/"/g, '\\"')}" --file "${sqlPath.replace(/"/g, '\\"')}"`;
  execSync(command, { stdio: "inherit", shell: true });
}

async function validate(url, tables) {
  process.env.DATABASE_URL = url;
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);

    const byTable = new Map();
    for (const row of rows) {
      if (!byTable.has(row.table_name)) {
        byTable.set(row.table_name, new Set());
      }
      byTable.get(row.table_name).add(row.column_name);
    }

    const missing = [];
    for (const table of tables) {
      const actualCols = byTable.get(table.name) || new Set();
      for (const col of table.columns) {
        if (!actualCols.has(col.name)) {
          missing.push({ table: table.name, column: col.name });
        }
      }
    }

    return {
      tableCount: byTable.size,
      missing,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const schemaPath = path.resolve(process.cwd(), args.schemaFile);
  const raw = fs.readFileSync(schemaPath, "utf8");
  const parsed = JSON.parse(raw);
  const tables = normalizeSchemaObject(parsed);
  const sql = buildSql(tables, args.reset);
  const sqlPath = writeSql(sql, args.outFile);

  console.log(`Generated SQL: ${sqlPath}`);
  console.log(`Tables in schema file: ${tables.length}`);

  if (args.dryRun) {
    console.log("Dry run complete. SQL not applied.");
    return;
  }

  applySql(sqlPath, args.url);
  const report = await validate(args.url, tables);

  if (report.missing.length > 0) {
    console.error("Validation failed. Missing columns:");
    for (const item of report.missing) {
      console.error(`- ${item.table}.${item.column}`);
    }
    process.exit(2);
  }

  console.log(`Validation passed. Checked ${tables.length} tables with all keys present.`);
  console.log(`Current public tables count: ${report.tableCount}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

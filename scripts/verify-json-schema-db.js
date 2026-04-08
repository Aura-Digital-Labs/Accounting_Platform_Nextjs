#!/usr/bin/env node

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

function parseArgs(argv) {
  const args = {
    schemaFile: null,
    strictTypes: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];

    if (!args.schemaFile && !token.startsWith("--")) {
      args.schemaFile = token;
      continue;
    }

    if (token === "--strict-types") {
      args.strictTypes = true;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (!args.schemaFile) {
    throw new Error("Usage: node scripts/verify-json-schema-db.js <schema.json> [--strict-types]");
  }

  return args;
}

function readSchema(schemaFile) {
  const absPath = path.resolve(process.cwd(), schemaFile);
  const raw = fs.readFileSync(absPath, "utf8");
  const parsed = JSON.parse(raw);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Schema file must be a JSON object: { tableName: { column: type } }");
  }

  return parsed;
}

function normalizeExpectedType(rawType) {
  const t = String(rawType || "").trim();
  const lower = t.toLowerCase();

  if (lower === "text") return { kind: "text" };
  if (lower === "integer") return { kind: "integer" };
  if (lower === "double") return { kind: "double" };
  if (lower === "boolean") return { kind: "boolean" };
  if (lower === "timestamp") return { kind: "timestamp" };
  if (lower === "date") return { kind: "date" };
  if (lower === "jsonb") return { kind: "jsonb" };

  const varcharMatch = lower.match(/^varchar\((\d+)\)$/);
  if (varcharMatch) {
    return { kind: "varchar", length: Number(varcharMatch[1]) };
  }

  const numericMatch = lower.match(/^numeric\((\d+),(\d+)\)$/);
  if (numericMatch) {
    return {
      kind: "numeric",
      precision: Number(numericMatch[1]),
      scale: Number(numericMatch[2]),
    };
  }

  if (/^enum\(.+\)$/i.test(t)) {
    return { kind: "enum" };
  }

  return { kind: "unknown", raw: t };
}

function actualTypeLabel(col) {
  if (col.data_type === "USER-DEFINED") {
    return `${col.data_type}(${col.udt_name})`;
  }

  if (col.data_type === "character varying") {
    return `${col.data_type}(${col.character_maximum_length ?? "?"})`;
  }

  if (col.data_type === "numeric") {
    return `${col.data_type}(${col.numeric_precision ?? "?"},${col.numeric_scale ?? "?"})`;
  }

  return col.data_type;
}

function matchesType(expected, actual, strictTypes) {
  const dataType = String(actual.data_type || "").toLowerCase();
  const udtName = String(actual.udt_name || "").toLowerCase();

  switch (expected.kind) {
    case "text":
      return dataType === "text";
    case "integer":
      return dataType === "integer";
    case "double":
      return dataType === "double precision";
    case "boolean":
      return dataType === "boolean";
    case "timestamp":
      return dataType.startsWith("timestamp");
    case "date":
      return dataType === "date";
    case "jsonb":
      return dataType === "jsonb";
    case "varchar":
      return (
        dataType === "character varying" &&
        Number(actual.character_maximum_length) === expected.length
      );
    case "numeric":
      return (
        dataType === "numeric" &&
        Number(actual.numeric_precision) === expected.precision &&
        Number(actual.numeric_scale) === expected.scale
      );
    case "enum":
      if (strictTypes) {
        return dataType === "user-defined" || udtName.length > 0;
      }
      // Compatibility mode: allow true enums or text/varchar storage used by JSON migrator.
      return (
        dataType === "user-defined" ||
        dataType === "text" ||
        dataType === "character varying"
      );
    default:
      return false;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const schema = readSchema(args.schemaFile);
  const prisma = new PrismaClient();

  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        table_name,
        column_name,
        data_type,
        udt_name,
        character_maximum_length,
        numeric_precision,
        numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);

    const tableToColumns = new Map();
    for (const row of rows) {
      if (!tableToColumns.has(row.table_name)) {
        tableToColumns.set(row.table_name, new Map());
      }
      tableToColumns.get(row.table_name).set(row.column_name, row);
    }

    const missingTables = [];
    const missingColumns = [];
    const typeMismatches = [];

    for (const [tableName, columns] of Object.entries(schema)) {
      const actualColumns = tableToColumns.get(tableName);
      if (!actualColumns) {
        missingTables.push(tableName);
        continue;
      }

      for (const [columnName, rawType] of Object.entries(columns)) {
        const actual = actualColumns.get(columnName);
        if (!actual) {
          missingColumns.push(`${tableName}.${columnName}`);
          continue;
        }

        const expected = normalizeExpectedType(rawType);
        if (expected.kind === "unknown") {
          typeMismatches.push({
            table: tableName,
            column: columnName,
            expected: String(rawType),
            actual: actualTypeLabel(actual),
            note: "Unsupported expected type in JSON schema",
          });
          continue;
        }

        if (!matchesType(expected, actual, args.strictTypes)) {
          typeMismatches.push({
            table: tableName,
            column: columnName,
            expected: String(rawType),
            actual: actualTypeLabel(actual),
          });
        }
      }
    }

    const result = {
      ok:
        missingTables.length === 0 &&
        missingColumns.length === 0 &&
        typeMismatches.length === 0,
      strictTypes: args.strictTypes,
      summary: {
        schemaTables: Object.keys(schema).length,
        dbTables: tableToColumns.size,
        missingTables: missingTables.length,
        missingColumns: missingColumns.length,
        typeMismatches: typeMismatches.length,
      },
      missingTables,
      missingColumns,
      typeMismatches,
    };

    console.log(JSON.stringify(result, null, 2));

    if (!result.ok) {
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

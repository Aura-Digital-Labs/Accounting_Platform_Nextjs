import psycopg2
import csv

# ====== CONFIG ======
ORIGINAL_DB = "new"
MADEUP_DB = "new_schema_with_original"

SCHEMA = "public"

DB_CONFIG = {
    "host": "localhost",
    "user": "postgres",
    "password": "postgres",
    "port": 5432
}

OUTPUT_FILE = "schema_comparison_report.csv"

# =====================

def normalize_type(dtype):
    """Normalize PostgreSQL type names"""
    mapping = {
        "int4": "integer",
        "int8": "bigint",
        "varchar": "character varying"
    }
    return mapping.get(dtype, dtype)


def get_connection(db_name):
    return psycopg2.connect(dbname=db_name, **DB_CONFIG)


def get_tables(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = %s
        """, (SCHEMA,))
        return {row[0] for row in cur.fetchall()}


def get_columns(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT 
                table_name,
                column_name,
                data_type,
                character_maximum_length,
                numeric_precision,
                numeric_scale,
                is_nullable,
                column_default
            FROM information_schema.columns
            WHERE table_schema = %s
        """, (SCHEMA,))
        rows = cur.fetchall()

    result = {}
    for row in rows:
        table, col, dtype, char_len, num_prec, num_scale, nullable, default = row

        if table not in result:
            result[table] = {}

        result[table][col] = {
            "data_type": normalize_type(dtype),
            "char_len": char_len,
            "num_prec": num_prec,
            "num_scale": num_scale,
            "nullable": nullable,
            "default": str(default)
        }

    return result


def compare_schemas(orig_tables, made_tables, orig_cols, made_cols):
    report = []

    # ---- Missing tables ----
    for table in orig_tables:
        if table not in made_tables:
            report.append(["TABLE_MISSING", table, "", "", ""])
    
    # ---- Column checks ----
    for table in orig_tables:
        if table not in made_cols:
            continue

        for col, odef in orig_cols.get(table, {}).items():

            if col not in made_cols.get(table, {}):
                report.append(["COLUMN_MISSING", table, col, "", ""])
                continue

            mdef = made_cols[table][col]

            # Compare all properties
            for key in odef:
                if odef[key] != mdef[key]:
                    report.append([
                        f"{key.upper()}_MISMATCH",
                        table,
                        col,
                        odef[key],
                        mdef[key]
                    ])

    return report


def save_report(report):
    with open(OUTPUT_FILE, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["Issue", "Table", "Column", "Original", "Madeup"])
        writer.writerows(report)


def print_report(report):
    if not report:
        print("✅ PERFECT MATCH: Made-up DB is a true superset (100% accurate).")
        return

    print("\n❌ Detailed Issues Found:\n")
    for r in report:
        print(f"{r[0]} | Table: {r[1]} | Column: {r[2]} | {r[3]} -> {r[4]}")


def main():
    conn1 = get_connection(ORIGINAL_DB)
    conn2 = get_connection(MADEUP_DB)

    try:
        orig_tables = get_tables(conn1)
        made_tables = get_tables(conn2)

        orig_cols = get_columns(conn1)
        made_cols = get_columns(conn2)

        report = compare_schemas(orig_tables, made_tables, orig_cols, made_cols)

        print_report(report)
        save_report(report)

        print(f"\n📁 Report saved to: {OUTPUT_FILE}")

    finally:
        conn1.close()
        conn2.close()


if __name__ == "__main__":
    main()
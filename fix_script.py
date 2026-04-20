import psycopg2

# ====== CONFIG ======
ORIGINAL_DB = "new"
MADEUP_DB = "test_db"
SCHEMA = "public"

DB_CONFIG = {
    "host": "localhost",
    "user": "postgres",
    "password": "postgres",
    "port": 5432
}


def get_connection(db):
    return psycopg2.connect(dbname=db, **DB_CONFIG)


def get_columns(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT table_name, column_name, data_type, udt_name,
                   is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = %s
        """, (SCHEMA,))
        return cur.fetchall()


def get_enums(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT t.typname, e.enumlabel
            FROM pg_type t
            JOIN pg_enum e ON t.oid = e.enumtypid
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = %s
            ORDER BY t.typname, e.enumsortorder;
        """, (SCHEMA,))
        rows = cur.fetchall()

    enums = {}
    for name, val in rows:
        enums.setdefault(name, []).append(val)

    return enums


def normalize(val):
    return str(val).strip().lower() if val else None


def main():
    conn1 = get_connection(ORIGINAL_DB)
    conn2 = get_connection(MADEUP_DB)

    enum_sql = []
    clean_sql = []
    alter_sql = []

    try:
        enums = get_enums(conn1)
        orig_cols = get_columns(conn1)
        made_cols = get_columns(conn2)

        made_lookup = {
            (t, c): (dtype, udt, nullable, default)
            for t, c, dtype, udt, nullable, default in made_cols
        }

        # ENUM CREATION
        for enum_name, values in enums.items():
            values_str = ", ".join(f"'{v}'" for v in values)

            enum_sql.append(f"""
DO $$
BEGIN
    BEGIN
        CREATE TYPE "{enum_name}" AS ENUM ({values_str});
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END
$$;
""")

        for t, c, dtype, udt, nullable, default in orig_cols:

            if (t, c) not in made_lookup:
                continue

            m_dtype, m_udt, m_nullable, m_default = made_lookup[(t, c)]

            # =============================
            # 🔥 ENUM DATA CLEANING
            # =============================
            if dtype == "USER-DEFINED":
                valid_values = enums.get(udt, [])

                if valid_values:
                    first_valid = valid_values[0]

                    valid_list = ", ".join(f"'{v}'" for v in valid_values)

                    clean_sql.append(f"""
UPDATE "{t}"
SET "{c}" = '{first_valid}'
WHERE "{c}" IS NOT NULL
AND "{c}"::text NOT IN ({valid_list});
""")

            # =============================
            # TYPE FIX (ENUM SAFE)
            # =============================
            if dtype != m_dtype or udt != m_udt:

                alter_sql.append(
                    f'ALTER TABLE "{t}" ALTER COLUMN "{c}" DROP DEFAULT;'
                )

                alter_sql.append(
                    f'ALTER TABLE "{t}" ALTER COLUMN "{c}" TYPE "{udt}" USING "{c}"::text::"{udt}";'
                )

                if default:
                    alter_sql.append(
                        f'ALTER TABLE "{t}" ALTER COLUMN "{c}" SET DEFAULT {default};'
                    )

    finally:
        conn1.close()
        conn2.close()

    # SAVE FILES
    with open("01_enums.sql", "w") as f:
        for line in enum_sql:
            f.write(line + "\n")

    with open("02_fix.sql", "w") as f:

        f.write("-- ENUM DATA CLEANING\n")
        for line in clean_sql:
            f.write(line + "\n")

        f.write("\n-- ALTER\n")
        for line in alter_sql:
            f.write(line + "\n")

    print("✅ FINAL ENUM-SAFE SCRIPT GENERATED")
    print("Run 01_enums.sql then 02_fix.sql")


if __name__ == "__main__":
    main()
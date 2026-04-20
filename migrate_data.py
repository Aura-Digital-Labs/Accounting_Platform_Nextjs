import psycopg2
import json
from collections import defaultdict, deque

# ===== CONFIG =====
SOURCE_DB = "new"
TARGET_DB = "new_schema_with_original"
SCHEMA = "public"

DB_CONFIG = {
    "host": "localhost",
    "user": "postgres",
    "password": "postgres",
    "port": 5432
}


def connect(db):
    return psycopg2.connect(dbname=db, **DB_CONFIG)


# ----------------------------
# GET TABLES
# ----------------------------
def get_tables(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = %s
            AND table_type = 'BASE TABLE'
        """, (SCHEMA,))
        return [row[0] for row in cur.fetchall()]


# ----------------------------
# GET COLUMNS
# ----------------------------
def get_columns(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT table_name, column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = %s
            ORDER BY ordinal_position
        """, (SCHEMA,))
        rows = cur.fetchall()

    cols = defaultdict(list)
    types = defaultdict(dict)
    nullable = defaultdict(dict)

    for t, c, dtype, isnull in rows:
        cols[t].append(c)
        types[t][c] = dtype
        nullable[t][c] = isnull

    return cols, types, nullable


# ----------------------------
# GET FK RELATIONSHIP
# ----------------------------
def get_fk_map(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT 
                kcu.table_name,
                kcu.column_name,
                ccu.table_name,
                ccu.column_name
            FROM information_schema.key_column_usage kcu
            JOIN information_schema.constraint_column_usage ccu
                ON kcu.constraint_name = ccu.constraint_name
            JOIN information_schema.table_constraints tc
                ON tc.constraint_name = kcu.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
            AND kcu.table_schema = %s
        """, (SCHEMA,))
        rows = cur.fetchall()

    fk = {}
    graph = defaultdict(set)

    for t, c, rt, rc in rows:
        fk[(t, c)] = (rt, rc)
        graph[t].add(rt)

    return fk, graph


# ----------------------------
# FIXED TOPO SORT
# ----------------------------
def topo_sort(graph, tables):
    tables_set = set(tables)

    indegree = {t: 0 for t in tables}

    # Only consider valid tables
    for t in graph:
        if t not in tables_set:
            continue

        for dep in graph[t]:
            if dep in tables_set:
                indegree[t] += 1

    queue = deque([t for t in tables if indegree[t] == 0])
    order = []

    while queue:
        t = queue.popleft()
        order.append(t)

        for other in graph:
            if other not in tables_set:
                continue

            if t in graph[other]:
                indegree[other] -= 1
                if indegree[other] == 0:
                    queue.append(other)

    # Fallback for cycles
    if len(order) != len(tables):
        remaining = [t for t in tables if t not in order]
        order.extend(remaining)

    return order


# ----------------------------
# GET SAFE FK VALUE
# ----------------------------
def get_fk_value(conn, table, column):
    with conn.cursor() as cur:
        cur.execute(f'SELECT "{column}" FROM "{table}" LIMIT 1')
        r = cur.fetchone()
        return r[0] if r else None


# ----------------------------
# CONVERT ROW
# ----------------------------
def convert_row(row, table, columns, types, nullable, fk_map, tgt_conn):

    new_row = []

    for i, val in enumerate(row):
        col = columns[i]
        dtype = types[col]
        isnull = nullable[col]

        # JSON fix
        if isinstance(val, (dict, list)):
            val = json.dumps(val)

        # Handle NULL for NOT NULL columns
        if val is None and isnull == "NO":

            key = (table, col)

            # FK fallback
            if key in fk_map:
                ref_table, ref_col = fk_map[key]
                val = get_fk_value(tgt_conn, ref_table, ref_col)

            elif dtype in ("integer", "numeric", "double precision", "bigint"):
                val = 0

            elif dtype == "boolean":
                val = False

            elif "timestamp" in dtype:
                val = None  # let DB default handle

            elif dtype in ("json", "jsonb"):
                val = json.dumps({})

            else:
                val = "auto_fix"

        new_row.append(val)

    return tuple(new_row)


# ----------------------------
# MIGRATE TABLE
# ----------------------------
def migrate_table(src_conn, tgt_conn, table, columns, types, nullable, fk_map):

    col_list = ", ".join(f'"{c}"' for c in columns)
    placeholders = ", ".join(["%s"] * len(columns))

    select_sql = f'SELECT {col_list} FROM "{table}"'
    insert_sql = f'''
        INSERT INTO "{table}" ({col_list})
        VALUES ({placeholders})
        ON CONFLICT DO NOTHING
    '''

    with src_conn.cursor() as src_cur, tgt_conn.cursor() as tgt_cur:

        print(f"🚀 Migrating: {table}")

        src_cur.execute(select_sql)

        while True:
            rows = src_cur.fetchmany(500)
            if not rows:
                break

            converted = [
                convert_row(r, table, columns, types, nullable, fk_map, tgt_conn)
                for r in rows
            ]

            try:
                tgt_cur.executemany(insert_sql, converted)
                tgt_conn.commit()
            except Exception as e:
                print(f"❌ Error in {table}: {e}")
                tgt_conn.rollback()


# ----------------------------
# MAIN
# ----------------------------
def main():

    src_conn = connect(SOURCE_DB)
    tgt_conn = connect(TARGET_DB)

    try:
        tables = get_tables(src_conn)
        cols, types, nullable = get_columns(src_conn)
        fk_map, graph = get_fk_map(tgt_conn)

        ordered_tables = topo_sort(graph, tables)

        print("\n🔄 Migration order:")
        print(ordered_tables, "\n")

        for table in ordered_tables:
            if table not in cols:
                continue

            migrate_table(
                src_conn,
                tgt_conn,
                table,
                cols[table],
                types[table],
                nullable[table],
                fk_map
            )

        print("\n✅ FULL SAFE MIGRATION COMPLETE")

    finally:
        src_conn.close()
        tgt_conn.close()


if __name__ == "__main__":
    main()
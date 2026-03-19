import { ReactNode } from "react";

type DataTableColumn<T> = {
  key: keyof T | string;
  header: string;
  className?: string;
  render?: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  title: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  emptyMessage: string;
};

export default function DataTable<T extends { id: number | string }>({
  title,
  columns,
  rows,
  emptyMessage,
}: DataTableProps<T>) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <span className="text-sm text-slate-500">{rows.length} item(s)</span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              {columns.map((column) => (
                <th key={String(column.key)} className={`px-3 py-2 font-semibold ${column.className || ""}`}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={String(row.id)} className="border-t border-slate-100 text-slate-700">
                  {columns.map((column) => (
                    <td key={String(column.key)} className={`px-3 py-2 align-top ${column.className || ""}`}>
                      {column.render
                        ? column.render(row)
                        : String(row[column.key as keyof T] ?? "-")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export type { DataTableColumn };

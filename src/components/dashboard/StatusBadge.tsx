type StatusBadgeProps = {
  status: string;
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 ring-amber-200",
  approved: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  approved_by_pm: "bg-yellow-100 text-yellow-800 ring-yellow-200",
  rejected: "bg-red-100 text-red-800 ring-red-200",
  rejected_by_pm: "bg-rose-100 text-rose-800 ring-rose-200",
};

function labelize(status: string) {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const key = status.toLowerCase();
  const style = STATUS_STYLES[key] || "bg-slate-100 text-slate-700 ring-slate-200";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${style}`}>
      {labelize(key)}
    </span>
  );
}

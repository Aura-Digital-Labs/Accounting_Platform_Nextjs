"use client";

import { useEffect, useState } from "react";
import styles from "./AdminDashboard.module.css";
import DataTable, { DataTableColumn } from "./dashboard/DataTable";
import StatusBadge from "./dashboard/StatusBadge";

interface AuditLog {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  description: string;
  status: string;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
  user?: {
    name: string;
    email: string;
  };
}

export default function AuditLogsDashboard({ userRole }: { userRole: string }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/audit-logs?limit=100");
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      const data = await res.json();
      setLogs(data.logs);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const columns: DataTableColumn<AuditLog>[] = [
    {
      header: "Timestamp",
      key: "timestamp",
      render: (log: AuditLog) => new Date(log.timestamp).toLocaleString(),
    },
    {
      header: "User",
      key: "user",
      render: (log: AuditLog) => log.user?.email || "System/Unknown",
    },
    { header: "Action", key: "action" },
    { header: "Resource Type", key: "resourceType" },
    { header: "Description", key: "description" },
    {
      header: "Status",
      key: "status",
      render: (log: AuditLog) => (
        <span
          className={
            log.status === "success" ? "text-green-500" : "text-red-500"
          }
        >
          {log.status}
        </span>
      ),
    },
    { header: "IP Address", key: "ipAddress" },
  ];

  if (loading) return <div className={styles.loading}>Loading logs...</div>;
  if (error) return <div className={styles.error}>{error}</div>;

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1>System Audit Logs</h1>
          <p>Role: {userRole}</p>
        </div>
      </header>
      <div className={styles.statsGrid}>
        <p>
          Review the historical audit trail of the application. The system
          records all significant data mutations and accesses.
        </p>
      </div>

      <div className={styles.tableSection}>
        <DataTable
          title="Recent Activities"
          rows={logs}
          columns={columns}
          emptyMessage="No audit logs found."
        />
      </div>
    </div>
  );
}

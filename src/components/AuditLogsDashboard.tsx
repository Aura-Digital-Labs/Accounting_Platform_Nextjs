"use client";

import { useEffect, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import styles from "./AdminDashboard.module.css";
import DataTable, { DataTableColumn } from "./dashboard/DataTable";
import StatusBadge from "./dashboard/StatusBadge";

import toast from 'react-hot-toast';
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
  const [total, setTotal] = useState(0);
  const limit = 100;

  useEffect(() => {
    fetchLogs(0);
  }, []);

  const fetchLogs = async (offset: number) => {
    try {
      const res = await fetch(`/api/audit-logs?limit=${limit}&offset=${offset}`);
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      const data = await res.json();
      if (offset === 0) {
        setLogs(data.logs);
      } else {
        setLogs((prev) => [...prev, ...data.logs]);
      }
      setTotal(data.total);
      setError(null);
    } catch (err: any) {
      toast.error(err.message); setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = () => {
    fetchLogs(logs.length);
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

  if (loading) return <LoadingSpinner />;
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Viewing {logs.length} of {total} logs</h2>
        </div>
        <DataTable
          title="Recent Activities"
          rows={logs}
          columns={columns}
          emptyMessage="No audit logs found."
        />
        
        {logs.length < total && (
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
            <button 
              className={styles.secondaryButton || 'bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-50 transition-colors font-medium'}
              onClick={handleLoadMore}
            >
              Load More
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthError } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ClosedAccountsPage() {
  try {
    await requireAdmin();
  } catch (error: unknown) {
    if (error instanceof AuthError && error.status === 401) {
      redirect("/login");
    }
    redirect("/");
  }

  const accounts = await prisma.account.findMany({
    where: { isClosed: true },
    orderBy: { closedAt: "desc" },
  });

  return (
    <div style={{ padding: "1.5rem" }}>
      <h1>Closed Accounts</h1>
      <p style={{ marginTop: "0.5rem", marginBottom: "1.25rem", color: "#555" }}>
        Historical list of accounts that have been closed.
      </p>

      {accounts.length === 0 ? (
        <div className="card">
          <p>No closed accounts found.</p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th style={{ padding: "0.75rem" }}>Code</th>
                <th style={{ padding: "0.75rem" }}>Name</th>
                <th style={{ padding: "0.75rem" }}>Type</th>
                <th style={{ padding: "0.75rem" }}>Closed At</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "0.75rem" }}>{account.code}</td>
                  <td style={{ padding: "0.75rem" }}>{account.name}</td>
                  <td style={{ padding: "0.75rem", textTransform: "capitalize" }}>
                    {account.type}
                  </td>
                  <td style={{ padding: "0.75rem" }}>
                    {account.closedAt
                      ? new Date(account.closedAt).toLocaleString()
                      : "Not recorded"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
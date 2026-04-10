import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import AdminDashboard from "@/components/AdminDashboard";
import FinancialOfficerDashboard from "@/components/FinancialOfficerDashboard";
import FixedDepositsDashboard from "@/components/FixedDepositsDashboard";

export default async function DashboardPage() {
  const session = await getServerSession();

  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role;
  const name = session.user.name || session.user.email || "User";

  if (role === "admin") {
    return <AdminDashboard displayName={name} isReadOnly={true} viewMode="overview" bottomContent={<FixedDepositsDashboard />} />;
  }

  if (role === "financial_officer") {
    return <FinancialOfficerDashboard displayName={name} viewMode="overview" />;
  }

  if (role === "employee") {
    redirect("/expenses/submit");
  }

  if (role === "client") {
    redirect("/client/payments");
  }

  if (role === "project_manager") {
    redirect("/expenses/submit");
  }

  return (
    <div>
      <h1>Welcome back, {name}</h1>
      <p>Role: {role}</p>

      <div style={{ marginTop: "2rem" }}>
        {role === "client" && (
          <div className="card">
            <h2>Client Dashboard</h2>
            <p>View your projects and submit payments.</p>
          </div>
        )}
        {role === "project_manager" && (
          <div className="card">
            <h2>PM Dashboard</h2>
            <p>Review expenses and client payments for your assigned projects.</p>
          </div>
        )}
      </div>
    </div>
  );
}

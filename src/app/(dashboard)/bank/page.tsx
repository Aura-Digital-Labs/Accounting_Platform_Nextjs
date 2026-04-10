import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import AdminDashboard from "@/components/AdminDashboard";
import FinancialOfficerDashboard from "@/components/FinancialOfficerDashboard";
import FixedDepositsDashboard from "@/components/FixedDepositsDashboard";

export default async function Page() {
  const session = await getServerSession();
  if (!session?.user) redirect("/login");
  
  const role = session.user.role;
  const name = session.user.name || session.user.email || "User";

  if (role === "admin") return <AdminDashboard displayName={name} isReadOnly={true} viewMode="bank" dashboardTitle="Bank & Fixed Deposits" bottomContent={<FixedDepositsDashboard />} />;
  if (role === "financial_officer") return <FinancialOfficerDashboard displayName={name} viewMode="bank" />;

  return <div style={{ padding: "24px" }}><h1>Access Denied</h1></div>;
}
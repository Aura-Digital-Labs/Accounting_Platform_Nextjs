import AdminDashboard from "./AdminDashboard";
import FixedDepositsDashboard from "./FixedDepositsDashboard";

export default function FinancialOfficerDashboard({ 
  displayName,
  viewMode = "all" 
}: { 
  displayName: string;
  viewMode?: "all" | "overview" | "detailed" | "employees" | "projects" | "custom-accounts" | "bank";
}) {
  const showFD = viewMode === "all" || viewMode === "detailed" || viewMode === "bank" || viewMode === "overview";

  return (
    <AdminDashboard
      displayName={displayName}
      dashboardTitle="Financial Officer Dashboard"
      bottomContent={showFD ? <FixedDepositsDashboard /> : undefined}
      viewMode={viewMode}
    />
  );
}
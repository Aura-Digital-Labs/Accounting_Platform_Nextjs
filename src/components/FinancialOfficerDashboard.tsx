import AdminDashboard from "./AdminDashboard";
import FixedDepositsDashboard from "./FixedDepositsDashboard";

export default function FinancialOfficerDashboard({ displayName }: { displayName: string }) {
  return (
    <AdminDashboard
      displayName={displayName}
      dashboardTitle="Financial Officer Dashboard"
      topContent={<FixedDepositsDashboard />}
    />
  );
}

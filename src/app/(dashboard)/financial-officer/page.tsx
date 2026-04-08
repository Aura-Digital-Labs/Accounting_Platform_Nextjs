import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import FinancialOfficerDashboard from "@/components/FinancialOfficerDashboard";

export default async function FinancialOfficerPage() {
  const session = await getServerSession();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "financial_officer") {
    redirect("/");
  }

  const name = session.user.name || session.user.email || "User";
  return <FinancialOfficerDashboard displayName={name} />;
}

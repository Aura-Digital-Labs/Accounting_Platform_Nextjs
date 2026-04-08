import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { redirect } from "next/navigation";
import AuditLogsDashboard from "@/components/AuditLogsDashboard";

export default async function LogsPage() {
  const session = await getServerSession(authOptions);

  if (!session || (session.user.role !== "admin" && session.user.role !== "financial_officer")) {
    redirect("/login");
  }

  return <AuditLogsDashboard userRole={session.user.role} />;
}
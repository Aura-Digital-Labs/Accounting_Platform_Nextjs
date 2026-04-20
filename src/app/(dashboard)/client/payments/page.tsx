import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import ClientPaymentsDashboard from "@/components/ClientPaymentsDashboard";

export default async function ClientPaymentsPage() {
  const session = await getServerSession();

  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role?.toLowerCase() || "";
  if (role !== "client") {
    redirect("/");
  }

  return <ClientPaymentsDashboard />;
}

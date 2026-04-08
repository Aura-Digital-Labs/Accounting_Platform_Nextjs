import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import AdminSettingsClient from "@/app/(dashboard)/settings/settings-client";

export default async function FinancialOfficerSettingsPage() {
  const session = await getServerSession();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "financial_officer") {
    redirect("/");
  }

  return <AdminSettingsClient heading="Financial Officer" />;
}

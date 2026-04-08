import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import AdminSettingsClient from "./settings-client";

export default async function AdminSettingsPage() {
  const session = await getServerSession();

  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role;
  if (role !== "admin" && role !== "financial_officer") {
    redirect("/");
  }

  return <AdminSettingsClient heading={role === "financial_officer" ? "Financial Officer" : "Admin"} />;
}


const fs = require("fs");
const template = `import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import AdminDashboard from "@/components/AdminDashboard";
import FinancialOfficerDashboard from "@/components/FinancialOfficerDashboard";

export default async function Page() {
  const session = await getServerSession();
  if (!session?.user) redirect("/login");
  
  const role = session.user.role;
  const name = session.user.name || session.user.email || "User";

  if (role === "admin") return <AdminDashboard displayName={name} isReadOnly={true} viewMode="[MODE]" dashboardTitle="[TITLE]" />;
  if (role === "financial_officer") return <FinancialOfficerDashboard displayName={name} viewMode="[MODE]" />;

  return <div style={{ padding: "24px" }}><h1>Access Denied</h1></div>;
}`;

const pages = [
  { path: "src/app/(dashboard)/employees/page.tsx", mode: "employees", title: "Employees Management" },
  { path: "src/app/(dashboard)/projects/page.tsx", mode: "projects", title: "Projects Management" },
  { path: "src/app/(dashboard)/custom-accounts/page.tsx", mode: "custom-accounts", title: "Custom Accounts" },
  { path: "src/app/(dashboard)/bank/page.tsx", mode: "bank", title: "Bank & Fixed Deposits" }
];

pages.forEach(p => {
  fs.writeFileSync(p.path, template.replace(/\[MODE\]/g, p.mode).replace(/\[TITLE\]/g, p.title));
});


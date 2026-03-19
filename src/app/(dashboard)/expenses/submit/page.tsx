import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import EmployeeExpenseSubmission from "@/components/EmployeeExpenseSubmission";

export default async function ExpenseSubmitPage() {
  const session = await getServerSession();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "employee" && session.user.role !== "project_manager") {
    redirect("/");
  }

  return <EmployeeExpenseSubmission role={session.user.role} />;
}
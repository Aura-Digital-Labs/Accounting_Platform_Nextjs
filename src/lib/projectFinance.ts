import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function syncProjectFinanceStatus(projectId: string) {
  if (!projectId) return;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { account: { include: { entries: true } } }
  });

  if (!project || !project.accountId) return;

  const pendingExpenses = await prisma.expense.findFirst({
    where: {
      status: { in: ['pending', 'approved_by_pm'] },
      OR: [
        { projectId: projectId },
        { lineItems: { some: { projectId: projectId } } }
      ]
    }
  });

  const pendingPayments = await prisma.clientPayment.findFirst({
    where: {
      projectId: projectId,
      status: { in: ['pending', 'approved_by_pm'] }
    }
  });

  let balance = 0;
  if (project.account) {
    const typeStr = (project.account.type as string).toUpperCase();
    const isDebit = typeStr === "ASSET" || typeStr === "EXPENSE";

    for (const e of project.account.entries) {
      const entryTypeStr = (e.entryType as string).toUpperCase();
      const amt = Number(e.amount);
      if (entryTypeStr === "DEBIT") {
        balance += isDebit ? amt : -amt;
      } else {
        balance += isDebit ? -amt : amt;
      }
    }
  }

  const hasPending = !!pendingExpenses || !!pendingPayments;
  
  let calculatedFinanceStatus = "Payment Required";
  if (hasPending) {
    calculatedFinanceStatus = "Outdated";
  } else if (Math.abs(balance) === 0) {
    calculatedFinanceStatus = "Ready to Deliver";
  }

  if (project.financeStatus !== calculatedFinanceStatus) {
    await prisma.$executeRaw(
      Prisma.sql`UPDATE "Project" SET finance_status = ${calculatedFinanceStatus} WHERE id = ${projectId}`
    );
  }
}

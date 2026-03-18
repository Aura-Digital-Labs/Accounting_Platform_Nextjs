import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin, AuthError, hashPassword } from "@/lib/auth";
import { AccountingError } from "@/lib/accounting";

/**
 * POST /api/projects — Create project + client user + account + funding
 * GET  /api/projects — List projects
 */
export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireAdmin();
    const body = await req.json();

    const { code, name, description, budget } = body;
    const employeeIds = Array.isArray(body.employee_ids)
      ? body.employee_ids
          .map((value: unknown) => Number(value))
          .filter((value: number) => Number.isFinite(value) && value > 0)
      : [];
    const normalizedBudget = Number(budget || 0);

    const existingCode = await prisma.project.findUnique({ where: { code } });
    if (existingCode) {
      return NextResponse.json({ detail: "Project code already exists" }, { status: 409 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create client user
      const clientEmail = `client_${code.toLowerCase()}@example.com`;
      const clientRandomPassword = Math.random().toString(36).slice(-8);

      const clientUser = await tx.user.create({
        data: {
          email: clientEmail,
          username: `client_${code.toLowerCase()}`,
          fullName: `Client - ${name}`,
          hashedPassword: await hashPassword(clientRandomPassword),
          role: "client",
        },
      });

      // 2. Create project account (Asset)
      const projectAccountCode = `PRJ-${code}`;
      const projectAccount = await tx.account.create({
        data: {
          code: projectAccountCode,
          name: `Project Asset - ${name}`,
          type: "asset",
          description: `Asset account for project ${code}`,
          budget: normalizedBudget,
        },
      });

      // 3. Create project
      const project = await tx.project.create({
        data: {
          code,
          name,
          description: description || null,
          budget: normalizedBudget,
          accountId: projectAccount.id,
          clientId: clientUser.id,
          clientPassword: clientRandomPassword,
        },
      });

      // 4. Update the account to have a projectId (satisfy unique relation)
      await tx.account.update({
        where: { id: projectAccount.id },
        data: { projectId: project.id },
      });

      // 5. Fund project budget (Debit project asset, Credit admin equity)
      // Keep this in the same tx so newly created accounts are visible.
      if (normalizedBudget > 0) {
        let adminAccount = await tx.account.findUnique({
          where: { code: `ADM-${currentUser.id}` },
        });

        if (!adminAccount) {
          adminAccount = await tx.account.create({
            data: {
              code: `ADM-${currentUser.id}`,
              name: `Admin Equity ${currentUser.fullName}`,
              type: "equity",
            },
          });
        }

        await tx.transaction.create({
          data: {
            description: `Initial budget funding for project ${code}`,
            createdBy: currentUser.id,
            sourceType: "project_budget",
            sourceId: project.id,
            entries: {
              create: [
                { accountId: projectAccount.id, entryType: "debit", amount: normalizedBudget },
                { accountId: adminAccount.id, entryType: "credit", amount: normalizedBudget },
              ],
            },
          },
        });
      }

      if (employeeIds.length > 0) {
        const employees = await tx.user.findMany({
          where: {
            id: { in: employeeIds },
            role: "employee",
          },
          select: { id: true },
        });

        if (employees.length !== employeeIds.length) {
          throw new AccountingError(400, "One or more selected employees are invalid");
        }

        await tx.projectAssignment.createMany({
          data: employeeIds.map((employeeId: number) => ({
            projectId: project.id,
            employeeId,
          })),
          skipDuplicates: true,
        });
      }

      return {
        ...project,
        budget: Number(project.budget),
        clientUsername: clientUser.username,
        clientPassword: clientRandomPassword,
      };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    if (error instanceof AccountingError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to create project";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const currentUser = await requireAuth();

    let projects;
    if (currentUser.role === "admin") {
      projects = await prisma.project.findMany({
        orderBy: { id: "desc" },
        include: {
          client: {
            select: {
              username: true,
            },
          },
          assignments: {
            select: {
              employeeId: true,
            },
          },
        },
      });
    } else if (currentUser.role === "client") {
      projects = await prisma.project.findMany({
        where: { clientId: currentUser.id },
        orderBy: { id: "desc" },
      });
    } else if (currentUser.role === "project_manager") {
      const assignments = await prisma.projectManagerAssignment.findMany({
        where: { managerId: currentUser.id },
        select: { projectId: true },
      });
      projects = await prisma.project.findMany({
        where: { id: { in: assignments.map((a) => a.projectId) } },
        orderBy: { id: "desc" },
      });
    } else { // employee
      const assignments = await prisma.projectAssignment.findMany({
        where: { employeeId: currentUser.id },
        select: { projectId: true },
      });
      projects = await prisma.project.findMany({
        where: { id: { in: assignments.map((a) => a.projectId) } },
        orderBy: { id: "desc" },
      });
    }

    return NextResponse.json(
      projects.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        budget: Number(p.budget),
        account_id: p.accountId,
        client_id: p.clientId,
        client_username: "client" in p && p.client ? p.client.username : null,
        client_password: currentUser.role === "admin" ? p.clientPassword : null,
        employee_ids:
          currentUser.role === "admin" && "assignments" in p && Array.isArray(p.assignments)
            ? p.assignments.map((row: { employeeId: number }) => row.employeeId)
            : [],
      }))
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to list projects";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

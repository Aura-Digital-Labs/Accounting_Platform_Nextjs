import { redirect } from "next/navigation";
import { requireAdmin, AuthError } from "@/lib/auth";
import AccountTransactionsClient from "./account-transactions-client";

export const dynamic = "force-dynamic";

export default async function AccountLedgerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let user;
  try {
    user = await requireAdmin();
  } catch (error: unknown) {
    if (error instanceof AuthError && error.status === 401) {
      redirect("/login");
    }
    redirect("/");
  }

  const { id } = await params;
  const accountId = Number(id);

  if (!Number.isFinite(accountId) || accountId <= 0) {
    redirect("/");
  }

  return <AccountTransactionsClient accountId={accountId} isReadOnly={user.role === "admin"} />;
}
